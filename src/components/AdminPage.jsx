import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Shield, Users, Activity, Monitor, ChevronLeft, MapPin, Lock } from 'lucide-react';

const socketUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:5000' 
    : 'https://screen-backend-h6rl.onrender.com';
const socket = io(socketUrl);

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
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', { to: userId, candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            console.log(`Received track from ${userId}`);
            setStreams(prev => ({
                ...prev,
                [userId]: event.streams[0]
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
                <div className="card" style={{ padding: '1.5rem', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <button 
                            className="btn" 
                            style={{ background: 'transparent', padding: '0.5rem 1rem', border: '1px solid #334155' }}
                            onClick={() => setSelectedUserId(null)}
                        >
                            <ChevronLeft size={18} />
                            Back to List
                        </button>
                        <div className="stream-label" style={{ margin: 0 }}>
                            <span style={{ fontWeight: 600 }}>LIVE FEED: {selectedUserId.substring(0, 12)}</span>
                            <div className="status-badge status-active" style={{ margin: 0 }}>
                                <div className="pulse"></div>
                                DIRECT CONNECTION
                            </div>
                        </div>
                    </div>
                    <div className="video-container" style={{ borderRadius: '12px' }}>
                        <video 
                            ref={v => v && (v.srcObject = streams[selectedUserId])} 
                            autoPlay 
                            playsInline 
                            style={{ width: '100%', height: 'auto', maxHeight: '80vh' }}
                        />
                    </div>
                </div>
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
                                <button className="btn" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                                    View Screen
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
