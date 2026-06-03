import { useRef, useCallback, useEffect } from "react";

export function useBlobDownload() {
  const urlRef = useRef<string | null>(null);

  const download = useCallback((content: string, fileName: string, mimeType: string) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  }, []);

  const downloadUrl = useCallback(async (url: string, fileName: string) => {
    const token = localStorage.getItem("token");
    const resp = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    const blob = await resp.blob();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const objUrl = URL.createObjectURL(blob);
    urlRef.current = objUrl;
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = fileName;
    a.click();
  }, []);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return { download, downloadUrl };
}
