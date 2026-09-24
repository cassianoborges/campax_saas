import { useEffect, useRef, useState } from 'react';
import { Video, Radio, AlertCircle, Loader2 } from 'lucide-react';

interface WebRTCPlayerProps {
    webrtcUrl: string;
    cameraName: string;
}

export function WebRTCPlayer({ webrtcUrl, cameraName }: WebRTCPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
    const [error, setError] = useState<string>('');

    useEffect(() => {
        let pc: RTCPeerConnection;

        const startWebRTC = async () => {
            try {
                setStatus('connecting');
                setError('');

                // DEBUG: Log da URL recebida
                console.log('🔍 WebRTC URL recebida:', webrtcUrl);

                // Criar PeerConnection
                pc = new RTCPeerConnection({
                    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
                });

                pcRef.current = pc;

                // Adicionar transceiver para receber vídeo
                pc.addTransceiver('video', { direction: 'recvonly' });
                pc.addTransceiver('audio', { direction: 'recvonly' });

                // Criar oferta
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                // Enviar oferta para MediaMTX com autenticação
                const auth = btoa('my_admin:my_password'); // Base64 encode
                const response = await fetch(webrtcUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/sdp',
                        'Authorization': `Basic ${auth}`
                    },
                    body: offer.sdp,
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                // Receber resposta
                const answerSdp = await response.text();
                await pc.setRemoteDescription({
                    type: 'answer',
                    sdp: answerSdp,
                });

                // Configurar stream de vídeo
                pc.ontrack = (event) => {
                    if (videoRef.current && event.streams[0]) {
                        videoRef.current.srcObject = event.streams[0];
                        setStatus('connected');
                    }
                };

                // Monitorar estado da conexão
                pc.onconnectionstatechange = () => {
                    console.log('Connection state:', pc.connectionState);
                    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                        setStatus('error');
                        setError('Conexão perdida');
                    }
                };

            } catch (err: any) {
                console.error('Erro WebRTC:', err);
                setStatus('error');
                setError(err.message || 'Erro ao conectar');
            }
        };

        startWebRTC();

        // Cleanup
        return () => {
            if (pc) {
                pc.close();
            }
        };
    }, [webrtcUrl]);

    return (
        <div className="relative bg-black rounded-lg overflow-hidden aspect-video shadow-elegant">
            <video
                ref={videoRef}
                className="w-full h-full object-contain"
                autoPlay
                playsInline
                muted
            />

            {/* Status overlay */}
            {status === 'connecting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white">
                    <Loader2 className="w-12 h-12 animate-spin text-gold mb-4" />
                    <p className="text-cream">Conectando câmera...</p>
                    <p className="text-cream/50 text-xs mt-2">{cameraName}</p>
                </div>
            )}

            {status === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white">
                    <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                    <p className="text-red-400 font-medium">Erro na transmissão</p>
                    <p className="text-cream/50 text-sm mt-2">{error}</p>
                    <p className="text-cream/30 text-xs mt-4">{cameraName}</p>
                </div>
            )}

            {/* Camera name overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                <div className="flex items-center justify-between">
                    <p className="text-white text-sm font-medium">{cameraName}</p>
                    {status === 'connected' && (
                        <div className="flex items-center gap-2 text-xs text-green-400">
                            <Radio className="w-3 h-3 animate-pulse" />
                            <span>AO VIVO</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
