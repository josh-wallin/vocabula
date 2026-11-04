/** Speaker buttons: a small one beside Latin text, a big one for listening exercises. Never blocks a lesson. */
import { useEffect, useState } from 'preact/hooks';
import type { AudioRef } from '../audio/items.ts';
import { audioAvailable, audioMissing, playClip } from '../audio/player.ts';
import { IconSpeaker } from './icons.tsx';

export function Speaker({ audio, autoplay = false, big = false, label = 'Listen' }: { audio: AudioRef; autoplay?: boolean; big?: boolean; label?: string }) {
  const [hidden, setHidden] = useState(() => !audioAvailable(audio));
  const [playing, setPlaying] = useState(false);
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
  if (hidden && !big) return null;
  return (
    <button type="button" class={`speaker${big ? ' big' : ''}${playing ? ' playing' : ''}`} aria-label={label} title={label}
      data-testid={big ? 'play' : 'speaker'} data-audio={audio.key} disabled={hidden} lang="en"
      onClick={(e) => { e.stopPropagation(); void play(); }}>
      <IconSpeaker size={big ? 40 : 20} />
    </button>
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
