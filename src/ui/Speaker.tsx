/**
 * Speaker buttons: a small one beside Latin text, a big one for listening exercises. Never blocks a lesson.
 * Long-press (or right-click) opens "Report bad audio" when the App has registered a reporter.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AudioRef } from '../audio/items.ts';
import { audioAvailable, audioMissing, clipKey, lastPlayed, playClip } from '../audio/player.ts';
import { AudioReportSheet, canReportAudio } from './AudioReport.tsx';
import { IconSpeaker } from './icons.tsx';

const LONG_PRESS_MS = 600;

export function Speaker({ audio, autoplay = false, big = false, label = 'Listen' }: { audio: AudioRef; autoplay?: boolean; big?: boolean; label?: string }) {
  const [hidden, setHidden] = useState(() => !audioAvailable(audio));
  const [playing, setPlaying] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const cancelPress = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  /** The key this speaker last played (or would play now). */
  const playedKey = () => { const l = lastPlayed(); return l && typeof l.clip !== 'string' && l.clip.key === audio.key ? l.key : clipKey(audio); };
  const openReport = () => { cancelPress(); longPressed.current = true; setReport(playedKey()); };
  const play = async () => {
    setPlaying(true);
    const ok = await playClip(audio);
    setPlaying(false);
    if (!ok && (audioMissing(audio) || !audioAvailable(audio))) setHidden(true);
  };
  useEffect(() => {
    setHidden(!audioAvailable(audio));
    if (autoplay && audioAvailable(audio)) void play();
  }, [audio.key]);
  useEffect(() => cancelPress, []);
  if (hidden && !big) return null;
  const reportable = !hidden && canReportAudio();
  return (
    <>
      <button type="button" class={`speaker${big ? ' big' : ''}${playing ? ' playing' : ''}`} aria-label={label}
        title={reportable ? `${label} (long-press to report bad audio)` : label}
        data-testid={big ? 'play' : 'speaker'} data-audio={audio.key} disabled={hidden} lang="en"
        onPointerDown={() => { longPressed.current = false; if (reportable) { cancelPress(); timer.current = setTimeout(openReport, LONG_PRESS_MS); } }}
        onPointerUp={cancelPress} onPointerLeave={cancelPress} onPointerCancel={cancelPress}
        onContextMenu={(e) => { if (reportable) { e.preventDefault(); openReport(); } }}
        onClick={(e) => { e.stopPropagation(); if (longPressed.current) { longPressed.current = false; return; } void play(); }}>
        <IconSpeaker size={big ? 40 : 20} />
      </button>
      {report && <AudioReportSheet audio={audio} playedKey={report} onClose={() => setReport(null)} />}
    </>
  );
}

/** The big play button of a listening exercise (it autoplays from the lesson; tap to hear again). */
export function ListenCue({ audio }: { audio: AudioRef }) {
  return (
    <div class="listen-cue" data-testid="listen-cue">
      <Speaker audio={audio} big label="Play again" />
      <span class="hint">Tap to hear it again</span>
    </div>
  );
}
