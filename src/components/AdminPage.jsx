import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Shield, Users, Activity, Monitor, ChevronLeft, MapPin, Lock } from 'lucide-react';

const socketUrl = 'https://screen-backend-h6rl.onrender.com';
const socket = io(socketUrl);

const VideoPlayer = ({ stream, onBack }) => {
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            // Explicitly call play to handle mobile restrictions
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    setIsPlaying(true);
                }).catch(e => {
                    console.error('Autoplay prevented:', e);
                    setIsPlaying(false); // Show manual play button
                });
            }
        }
    }, [stream]);

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#000', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <button 
                className="btn" 
                style={{ 
                    position: 'absolute', 
                    top: '1rem', 
                    left: '1rem', 
                    zIndex: 10000, 
                    padding: '0.75rem', 
                    borderRadius: '50%', 
                    background: 'rgba(0,0,0,0.5)', 
                    border: '1px solid rgba(255,255,255,0.2)',
                    backdropFilter: 'blur(5px)'
                }}
                onClick={onBack}
            >
                <ChevronLeft size={24} color="#fff" />
            </button>
            <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted
                controls={!isPlaying}
                onPlay={() => setIsPlaying(true)}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
            {!isPlaying && (
                <button 
                    onClick={() => {
                        if(videoRef.current) {
                            videoRef.current.play();
                            setIsPlaying(true);
                        }
                    }}
                    style={{ position: 'absolute', padding: '1rem 2rem', fontSize: '1.2rem', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', zIndex: 10001, cursor: 'pointer' }}
                >
                    Tap to View Screen
                </button>
            )}
        </div>
    );
};

const AdminPage = () => {
    const [streams, setStreams] = useState({}); // userId -> MediaStream
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [locations, setLocations] = useState({}); // userId -> { lat, lng }
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [authError, setAuthError] = useState('');
    const peerConnections = useRef({}); // userId -> RTCPeerConnection

    useEffect(() => {
        if (!isAuthenticated) return;

        const onConnect = () => socket.emit('join', { role: 'admin' });
        socket.on('connect', onConnect);
        if (socket.connected) onConnect();

        socket.on('offer', async ({ from, offer }) => {
            console.log(`Received offer from ${from}`);
            const pc = createPeerConnection(from);
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            socket.emit('answer', { to: from, answer });
        });

        socket.on('ice-candidate', async ({ from, candidate }) => {
            const pc = peerConnections.current[from];
            if (pc) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                    console.error('Error adding ice candidate', e);
                }
            }
        });

        socket.on('user-left', (userId) => {
            console.log(`User left: ${userId}`);
            if (peerConnections.current[userId]) {
                peerConnections.current[userId].close();
                delete peerConnections.current[userId];
            }
            setStreams(prev => {
                const next = { ...prev };
                delete next[userId];
                return next;
            });
            setLocations(prev => {
                const next = { ...prev };
                delete next[userId];
                return next;
            });
            setSelectedUserId(prev => prev === userId ? null : prev);
        });

        socket.on('location', async ({ from, location }) => {
            let address = `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.lat}&lon=${location.lng}`);
                const data = await res.json();
                if (data && data.address) {
                    address = data.address.city || data.address.town || data.address.county || data.address.state || address;
                }
            } catch (e) {
                console.error("Reverse geocoding failed", e);
            }
            setLocations(prev => ({ ...prev, [from]: { ...location, address } }));
        });

        return () => {
            socket.off('connect', onConnect);
            socket.off('offer');
            socket.off('ice-candidate');
            socket.off('user-left');
            socket.off('location');
            Object.values(peerConnections.current).forEach(pc => pc.close());
        };
    }, [isAuthenticated]);

    const createPeerConnection = (userId) => {
        if (peerConnections.current[userId]) {
            peerConnections.current[userId].close();
        }

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { 
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                { 
                    urls: 'turn:openrelay.metered.ca:443',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ]
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', { to: userId, candidate: event.candidate });
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log(`ICE Connection State for ${userId}: ${pc.iceConnectionState}`);
        };

        pc.ontrack = (event) => {
            console.log(`Received track from ${userId}`, event);
            // Handle cases where react-native-webrtc might not wrap the track in a stream
            const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
            setStreams(prev => ({
                ...prev,
                [userId]: stream
            }));
        };

        peerConnections.current[userId] = pc;
        return pc;
    };

    if (!isAuthenticated) {
        return (
            <div className="card" style={{ maxWidth: '400px', margin: '0 auto', marginTop: '10vh', padding: '3rem', textAlign: 'center' }}>
                <Lock size={48} color="#6366f1" style={{ marginBottom: '1.5rem', opacity: 0.8 }} />
                <h2>Admin Login</h2>
                <p style={{ marginBottom: '1.5rem', fontSize: '0.875rem', color: '#94a3b8' }}>Please enter the admin password to continue.</p>
                <input 
                    type="password" 
                    placeholder="Enter password" 
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setAuthError(''); }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            if (password === '10112003') setIsAuthenticated(true);
                            else setAuthError('Incorrect password');
                        }
                    }}
                    style={{ 
                        width: '100%', 
                        padding: '0.75rem', 
                        marginBottom: '1rem', 
                        borderRadius: '8px', 
                        border: '1px solid #334155', 
                        background: '#0f172a', 
                        color: '#fff',
                        outline: 'none',
                        boxSizing: 'border-box'
                    }}
                />
                {authError && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem', marginTop: '-0.5rem', textAlign: 'left' }}>{authError}</p>}
                <button 
                    className="btn" 
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                        if (password === '10112003') setIsAuthenticated(true);
                        else setAuthError('Incorrect password');
                    }}
                >
                    Login
                </button>
            </div>
        );
    }

    return (
        <div style={{ width: '100%', maxWidth: '1200px' }}>
            <div className="card" style={{ marginBottom: '2rem', textAlign: 'left', padding: '1.5rem 2.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Admin Dashboard</h1>
                        <p style={{ margin: 0, fontSize: '0.875rem' }}>Live Monitoring System</p>
                    </div>
                    <div style={{ display: 'flex', gap: '2rem' }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Activity size={16} />
                                {Object.keys(streams).length} Active
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Broadcasts</div>
                        </div>
                    </div>
                </div>
            </div>

            {Object.keys(streams).length === 0 ? (
                <div className="card" style={{ padding: '5rem' }}>
                    <Users size={48} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
                    <h2>No Active Streams</h2>
                    <p>Waiting for users to start sharing their screens...</p>
                </div>
            ) : selectedUserId && streams[selectedUserId] ? (
                <VideoPlayer 
                    stream={streams[selectedUserId]} 
                    onBack={() => setSelectedUserId(null)} 
                />
            ) : (
                <div className="card" style={{ padding: '2rem', textAlign: 'left' }}>
                    <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Monitor size={24} color="#6366f1" />
                        Active Systems List
                    </h2>
                    <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                        {Object.entries(streams).map(([userId, stream]) => (
                            <div 
                                key={userId} 
                                style={{ 
                                    background: '#1e293b', 
                                    padding: '1.5rem', 
                                    borderRadius: '12px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    border: '1px solid #334155',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                                onClick={() => setSelectedUserId(userId)}
                                onMouseOver={(e) => e.currentTarget.style.borderColor = '#6366f1'}
                                onMouseOut={(e) => e.currentTarget.style.borderColor = '#334155'}
                            >
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.25rem' }}>System: {userId.substring(0, 8)}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#10b981', marginTop: '0.25rem' }}>
                                        <div className="pulse" style={{ width: '8px', height: '8px', margin: 0 }}></div>
                                        Live
                                        {locations[userId] && (
                                            <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.5rem' }}>
                                                <MapPin size={12} />
                                                <a 
                                                    href={`https://www.google.com/maps?q=${locations[userId].lat},${locations[userId].lng}`} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    style={{ color: '#60a5fa', textDecoration: 'none' }}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {locations[userId].address || 'Map'}
                                                </a>
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button className="btn" style={{ padding: '0.75rem', borderRadius: '50%' }}>
                                    <Monitor size={20} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPage;
