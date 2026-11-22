import {QrCode} from 'lucide-react';
import QRCode from 'qrcode';
import {useEffect, useState} from 'react';

interface QrCodeBoxProps {
  value: string;
  size?: number;
  alt: string;
  className?: string;
}

export function QrCodeBox({value, size = 180, alt, className = ''}: QrCodeBoxProps) {
  const [dataUrl, setDataUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setDataUrl('');
      setFailed(false);
      return;
    }

    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 2,
      color: {dark: '#0F172A', light: '#FFFFFF'},
    })
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!value || failed || !dataUrl) {
    return (
      <div
        style={{width: size, height: size}}
        className={`flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400 ${className}`}
      >
        <QrCode className="h-8 w-8" />
        <span className="mt-2 text-xs font-medium">No address set</span>
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={alt}
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      className={`rounded-xl border border-slate-200 bg-white p-1.5 ${className}`}
    />
  );
}
