import { useState } from "react";

function App() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null); // stores video URL
  const [status, setStatus] = useState("");

  // 1. Capture file and create preview URL
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile)); // creates temporary playable URL
    }
  };

  // 2. Send file to backend
  const handleUpload = async () => {
    if (!file) {
      alert("Please select a file first");
      return;
    }

    setStatus("Uploading...");

    const formData = new FormData();
    formData.append("video", file);

    try {
      const response = await fetch("http://localhost:8000/videos_upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      const data = await response.json();
      setStatus(`Success! File saved at: ${data.saved_path}`);
    } catch (error) {
      console.error(error);
      setStatus("Upload failed. Check if backend is running.");
    }
  };

  return (
    <div>
      <h1>Upload Video</h1>

      {/* File picker */}
      <input type="file" accept="video/*" onChange={handleFileChange} />

      {/* Upload button */}
      <button onClick={handleUpload}>Upload</button>

      {/* Status message */}
      <p>{status}</p>

      {/* Video Screen / Player */}
      {previewUrl && (
        <div>
          <h3>Video Preview:</h3>
          <video
            src={previewUrl}
            controls
            width="600"
          />
        </div>
      )}
    </div>
  );
}

export default App;
