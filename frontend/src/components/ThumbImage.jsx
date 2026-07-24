import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";

const cache = new Map(); // path -> objectURL

export function ThumbImage({ storageId, item, fallback }) {
  const [url, setUrl] = useState(() => cache.get(`${storageId}:${item.path}`) || "");
  const [err, setErr] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const key = `${storageId}:${item.path}`;
    if (cache.has(key)) { setUrl(cache.get(key)); return; }
    if (item.size && item.size > 8 * 1024 * 1024) { setErr(true); return; }
    let cancelled = false;
    let created = null;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        io.disconnect();
        api.get(`/storages/${storageId}/files/download`, { params: { path: item.path }, responseType: "blob" })
          .then((res) => {
            if (cancelled) return;
            created = URL.createObjectURL(res.data);
            cache.set(key, created);
            setUrl(created);
          })
          .catch(() => !cancelled && setErr(true));
      }
    }, { rootMargin: "200px" });
    if (ref.current) io.observe(ref.current);
    return () => { cancelled = true; io.disconnect(); };
  }, [storageId, item.path, item.size]);

  if (err || !url) {
    return <div ref={ref} className="h-full w-full flex items-center justify-center">{fallback}</div>;
  }
  return <img ref={ref} src={url} alt={item.name} loading="lazy" className="h-full w-full object-cover" />;
}
