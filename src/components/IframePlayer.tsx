import { useEffect, useRef, useState } from 'react';
import { Video, Radio, AlertCircle, Loader2 } from 'lucide-react';

interface IframePlayerProps {
    webrtcUrl: string;
    cameraName: string;
}

export function IframePlayer({ webrtcUrl, cameraName }: IframePlayerProps) {
    const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

    // Remove /whep se existir para usar a página HTML do MediaMTX
    const pageUrl = webrtcUrl.replace('/whep', '');

    return (
        <div className="relative bg-black rounded-lg overflow-hidden aspect-video shadow-elegant">
            <iframe
                src={pageUrl}
                className="w-full h-full"
                allow="autoplay; camera; microphone"
                onLoad={() => setStatus('loaded')}
                onError={() => setStatus('error')}
            />

            {status === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white">
                    <Loader2 className="w-12 h-12 animate-spin text-gold mb-4" />
                    <p className="text-cream">Carregando stream...</p>
                    <p className="text-cream/50 text-xs mt-2">{cameraName}</p>
                </div>
            )}

            {/* Camera name overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pointer-events-none">
                <div className="flex items-center justify-between">
                    <p className="text-white text-sm font-medium">{cameraName}</p>
                    {status === 'loaded' && (
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
