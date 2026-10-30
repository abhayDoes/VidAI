import { useState, useCallback, useReducer, useEffect } from "react";

export const PIXELS_PER_SECOND = 20;
const HISTORY_LIMIT = 100;
const initial = {
  tracks: [
    { id: 2, name: "Track 2", type: "video", locked: false, visible: true },
    { id: 1, name: "Track 1", type: "video", locked: false, visible: true },
    { id: 101, name: "Audio Track 1 (BGM)", type: "audio", volume: 0.8, locked: false, visible: true },
  ],
  clips: [], markers: [],
};

function historyReducer(state, action) {
  if (action.type === "begin") return state.group ? state : { ...state, group: state.present };
  if (action.type === "end") {
    if (!state.group) return state;
    return state.group === state.present ? { ...state, group: null } : {
      ...state, past: [...state.past, state.group].slice(-HISTORY_LIMIT), future: [], group: null,
    };
  }
  if (action.type === "undo") {
    if (state.group || !state.past.length) return state;
    return { ...state, present: state.past.at(-1), past: state.past.slice(0, -1), future: [state.present, ...state.future] };
  }
  if (action.type === "redo") {
    if (state.group || !state.future.length) return state;
    return { ...state, past: [...state.past, state.present].slice(-HISTORY_LIMIT), present: state.future[0], future: state.future.slice(1) };
  }
  if (action.type !== "edit") return state;
  const present = action.update(state.present);
  if (present === state.present) return state;
  if (state.group) return { ...state, present };
  return { ...state, past: [...state.past, state.present].slice(-HISTORY_LIMIT), present, future: [] };
}

export default function useTimeline({ videoDuration }) {
  const [history, dispatch] = useReducer(historyReducer, { past: [], present: initial, future: [], group: null });
  const { tracks, clips, markers } = history.present;
  const [selection, setSelectedClipId] = useState(null);
  const selectedClipId = clips.some((clip) => clip.id === selection) ? selection : null;
  const [isSnapping, setIsSnapping] = useState(true);
  const edit = useCallback((update) => dispatch({ type: "edit", update }), []);
  const startHistoryGroup = useCallback(() => dispatch({ type: "begin" }), []);
  const endHistoryGroup = useCallback(() => dispatch({ type: "end" }), []);
  const finishMouseEdit = useCallback(() => queueMicrotask(endHistoryGroup), [endHistoryGroup]);
  const beginHistoryGroup = useCallback(() => {
    startHistoryGroup();
    window.addEventListener("mouseup", finishMouseEdit, { once: true });
  }, [startHistoryGroup, finishMouseEdit]);
  useEffect(() => () => window.removeEventListener("mouseup", finishMouseEdit), [finishMouseEdit]);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  const addClip = useCallback((clip) => {
    edit((state) => ({ ...state, clips: [...state.clips, clip] }));
    setSelectedClipId(clip.id);
  }, [edit]);
  const addTrack = useCallback((type = "video") => edit((state) => {
    const nextId = state.tracks.length ? Math.max(...state.tracks.map((t) => t.id)) + 1 : 1;
    const count = state.tracks.filter((t) => (t.type || "video") === type).length + 1;
    const track = { id: nextId, name: type === "audio" ? `Audio Track ${count}` : `Track ${count}`, type, volume: 0.8, locked: false, visible: true };
    return { ...state, tracks: type === "audio" ? [...state.tracks, track] : [track, ...state.tracks] };
  }), [edit]);
  const updateTrack = useCallback((trackId, change) => edit((state) => {
    const index = state.tracks.findIndex((track) => track.id === trackId);
    if (index < 0) return state;
    const tracks = [...state.tracks];
    tracks[index] = { ...tracks[index], ...change(tracks[index]) };
    return { ...state, tracks };
  }), [edit]);
  const setTrackVolume = useCallback((id, volume) => updateTrack(id, () => ({ volume: Math.max(0, Math.min(1, volume)) })), [updateTrack]);
  const toggleTrackLock = useCallback((id) => updateTrack(id, (track) => ({ locked: !track.locked })), [updateTrack]);
  const toggleTrackVisible = useCallback((id) => updateTrack(id, (track) => ({ visible: !track.visible })), [updateTrack]);
  const updateClip = useCallback((id, patch) => edit((state) => {
    const index = state.clips.findIndex((clip) => clip.id === id);
    if (index < 0 || Object.entries(patch).every(([key, value]) => state.clips[index][key] === value)) return state;
    const clips = [...state.clips];
    clips[index] = { ...clips[index], ...patch };
    return { ...state, clips };
  }), [edit]);
  const splitClip = useCallback((clipId, atTime) => {
    const target = clips.find((clip) => clip.id === clipId);
    if (!target || atTime <= target.start || atTime >= target.start + target.duration) return;
    const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const speed = target.speed || 1;
    const sourceStart = target.sourceStart || 0;
    const firstDuration = atTime - target.start;
    const splitTime = sourceStart + firstDuration * speed;
    const sourceEnd = sourceStart + target.duration * speed;
    const first = { ...target, duration: firstDuration, sourceMin: sourceStart, sourceMax: splitTime };
    const second = { ...target, id: newId, title: `${target.title} (Part 2)`, start: atTime, duration: target.duration - firstDuration, sourceStart: splitTime, sourceMin: splitTime, sourceMax: sourceEnd };
    edit((state) => {
      const index = state.clips.findIndex((clip) => clip.id === clipId);
      if (index < 0) return state;
      const clips = [...state.clips];
      clips.splice(index, 1, first, second);
      return { ...state, clips };
    });
    setSelectedClipId(newId);
  }, [clips, edit]);
  const addMarker = useCallback((time) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    edit((state) => ({ ...state, markers: [...state.markers, { id, time, label: `Marker ${state.markers.length + 1}` }] }));
  }, [edit]);
  const deleteClip = useCallback((id) => {
    const deleted = clips.find((clip) => clip.id === id);
    if (!deleted) return null;
    edit((state) => {
      const clip = state.clips.find((item) => item.id === id);
      if (!clip) return state;
      const end = clip.start + clip.duration;
      return { ...state,
        clips: state.clips.filter((item) => item.id !== id).map((item) => item.trackId === clip.trackId && item.start >= end ? { ...item, start: Math.max(0, item.start - clip.duration) } : item),
        markers: state.markers.flatMap((marker) => marker.time >= clip.start && marker.time < end ? [] : [marker.time >= end ? { ...marker, time: marker.time - clip.duration } : marker]),
      };
    });
    setSelectedClipId(null);
    return deleted;
  }, [clips, edit]);
  const moveClipToTrack = useCallback((clipId, trackId) => edit((state) => {
    const clip = state.clips.find((item) => item.id === clipId);
    const target = state.tracks.find((track) => track.id === trackId);
    if (!clip || !target || target.locked || clip.trackId === trackId || (clip.type === "audio") !== (target.type === "audio")) return state;
    return { ...state, clips: state.clips.map((item) => item.id === clipId ? { ...item, trackId } : item) };
  }), [edit]);
  const snapTime = useCallback((rawTime, ignoreClipId = null) => {
    if (!isSnapping) return rawTime;
    const targets = [0];
    clips.forEach((clip) => { if (clip.id !== ignoreClipId) targets.push(clip.start, clip.start + clip.duration); });
    markers.forEach((marker) => targets.push(marker.time));
    let best = rawTime;
    let delta = 10 / PIXELS_PER_SECOND;
    targets.forEach((target) => { const diff = Math.abs(target - rawTime); if (diff < delta) { best = target; delta = diff; } });
    return Math.max(0, best);
  }, [isSnapping, clips, markers]);

  return { tracks, clips, markers, selectedClipId, isSnapping, setIsSnapping,
    timelineDuration: Math.max(videoDuration, 120), addClip, addTrack, toggleTrackLock, toggleTrackVisible,
    setTrackVolume, splitClip, addMarker, deleteClip, updateClip, moveClipToTrack,
    selectClip: setSelectedClipId, snapTime, undo, redo, beginHistoryGroup, startHistoryGroup, endHistoryGroup,
    canUndo: !history.group && history.past.length > 0, canRedo: !history.group && history.future.length > 0 };
}
