import { useState, useCallback } from "react";

export const PIXELS_PER_SECOND = 20;

export default function useTimeline({ videoDuration }) {
  const [tracks, setTracks] = useState([
    { id: 3, name: "Track 3", locked: false, visible: true },
    { id: 2, name: "Track 2", locked: false, visible: true },
    { id: 1, name: "Track 1", locked: false, visible: true },
  ]);
  const [clips, setClips] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [isSnapping, setIsSnapping] = useState(true);

  const addClip = useCallback((clip) => {
    setClips((prev) => [...prev, clip]);
    setSelectedClipId(clip.id);
  }, []);

  const addTrack = useCallback(() => {
    setTracks((prev) => {
      const nextId = prev.length ? Math.max(...prev.map((t) => t.id)) + 1 : 1;
      return [
        { id: nextId, name: `Track ${nextId}`, locked: false, visible: true },
        ...prev,
      ];
    });
  }, []);

  const toggleTrackLock = useCallback((trackId) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, locked: !t.locked } : t))
    );
  }, []);

  const toggleTrackVisible = useCallback((trackId) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, visible: !t.visible } : t))
    );
  }, []);

  const splitClip = useCallback(
    (clipId, atTime) => {
      if (!clipId) return;
      const targetClip = clips.find((c) => c.id === clipId);
      if (!targetClip) return;

      const clipEnd = targetClip.start + targetClip.duration;
      if (atTime <= targetClip.start || atTime >= clipEnd) return;

      const firstDuration = atTime - targetClip.start;
      const secondDuration = targetClip.duration - firstDuration;

      const newId = Date.now();
      const sourceStart = targetClip.sourceStart || 0;
      const splitSourceTime = sourceStart + firstDuration;
      const sourceEnd = sourceStart + targetClip.duration;
      const clip1 = {
        ...targetClip,
        duration: firstDuration,
        sourceMin: sourceStart,
        sourceMax: splitSourceTime,
      };
      const clip2 = {
        id: newId,
        trackId: targetClip.trackId,
        title: `${targetClip.title} (Part 2)`,
        start: atTime,
        duration: secondDuration,
        sourceStart: splitSourceTime,
        sourceMin: splitSourceTime,
        sourceMax: sourceEnd,
      };

      setClips((prev) => {
        const clipIndex = prev.findIndex((c) => c.id === clipId);
        if (clipIndex === -1) return prev;
        const updated = [...prev];
        updated.splice(clipIndex, 1, clip1, clip2);
        return updated;
      });
      setSelectedClipId(newId);
    },
    [clips]
  );

  const addMarker = useCallback(
    (time) => {
      setMarkers((prev) => [
        ...prev,
        { id: Date.now(), time, label: `Marker ${prev.length + 1}` },
      ]);
    },
    []
  );

  const deleteClip = useCallback(
    (clipId) => {
      const deletedClip = clips.find((clip) => clip.id === clipId);
      if (!deletedClip) return null;

      const deletedEnd = deletedClip.start + deletedClip.duration;
      setClips((prev) =>
        prev
          .filter((clip) => clip.id !== clipId)
          .map((clip) =>
            clip.trackId === deletedClip.trackId && clip.start >= deletedEnd
              ? { ...clip, start: Math.max(0, clip.start - deletedClip.duration) }
              : clip
          )
      );
      setMarkers((prev) =>
        prev.flatMap((marker) => {
          if (marker.time >= deletedClip.start && marker.time < deletedEnd) {
            return [];
          }
          if (marker.time >= deletedEnd) {
            return [{ ...marker, time: marker.time - deletedClip.duration }];
          }
          return [marker];
        })
      );
      setSelectedClipId(null);
      return deletedClip;
    },
    [clips]
  );

  const updateClip = useCallback((clipId, patch) => {
    setClips((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, ...patch } : c))
    );
  }, []);

  const snapTime = useCallback(
    (rawTime, ignoreClipId = null) => {
      if (!isSnapping) return rawTime;

      const snapTargets = [0];
      clips.forEach((c) => {
        if (c.id === ignoreClipId) return;
        snapTargets.push(c.start, c.start + c.duration);
      });
      markers.forEach((m) => snapTargets.push(m.time));

      const threshold = 10 / PIXELS_PER_SECOND;
      let best = rawTime;
      let bestDelta = threshold;

      snapTargets.forEach((target) => {
        const delta = Math.abs(target - rawTime);
        if (delta < bestDelta) {
          best = target;
          bestDelta = delta;
        }
      });

      return Math.max(0, best);
    },
    [isSnapping, clips, markers]
  );

  return {
    tracks,
    clips,
    markers,
    selectedClipId,
    isSnapping,
    setIsSnapping,
    timelineDuration: Math.max(videoDuration, 120),
    addClip,
    addTrack,
    toggleTrackLock,
    toggleTrackVisible,
    splitClip,
    addMarker,
    deleteClip,
    updateClip,
    selectClip: setSelectedClipId,
    snapTime,
  };
}
