const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const videoApi = {
  // 1. Upload initial raw video
  upload: async (file) => {
    const formData = new FormData();
    formData.append("video", file);
    const res = await fetch(`${API_BASE}/videos_upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  },

  // 2. Trim video
  trim: async ({ filename, start, duration }) => {
    const res = await fetch(`${API_BASE}/edit/trim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, start, duration }),
    });
    if (!res.ok) throw new Error("Trim failed");
    return res.json();
  },

  // 3. Rotate video (90, 180, etc.)
  rotate: async ({ filename, angle }) => {
    const res = await fetch(`${API_BASE}/edit/rotate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, angle }),
    });
    if (!res.ok) throw new Error("Rotate failed");
    return res.json();
  },

  // 4. Change resolution (1080p, 720p, 9:16 vertical)
  resize: async ({ filename, width, height }) => {
    const res = await fetch(`${API_BASE}/edit/resize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, width, height }),
    });
    if (!res.ok) throw new Error("Resize failed");
    return res.json();
  },

  // 5. Merge timeline clips into one video
  merge: async (segments) => {
    const res = await fetch(`${API_BASE}/edit/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments }),
    });
    if (!res.ok) throw new Error("Merge failed");
    return res.json();
  },
};
