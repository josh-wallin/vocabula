/** App shell: routes between import, path, lesson, complete and tab pages. */
import { useEffect, useState } from 'preact/hooks';
import {
  frontier, lessonFor, loadApp, withEvents, practiceNode, recordNodeDone, recordReview, streakNow, PRACTICE_NODE, type AppData,
} from '../app/controller.ts';
import type { PathNode } from '../engine/path.ts';
import type { Exercise } from '../engine/lesson.ts';
import type { LessonStats } from '../engine/events.ts';
import { chapterText } from '../data/contentStore.ts';
import { outboxCount } from '../data/db.ts';
import { uuid } from '../engine/util.ts';
import { roman } from '../engine/curriculum.ts';
import { PathScreen } from './PathScreen.tsx';
import { Lesson, type LessonResult } from './Lesson.tsx';
import { Complete } from './Complete.tsx';
import { Markdown } from './Markdown.tsx';
import { AboutScreen, ImportScreen, ProfileScreen, WordsScreen } from './Pages.tsx';
import { IconBack, IconCloudOff, IconFlame, IconPath, IconPractice, IconProfile, IconStar, IconWords } from './icons.tsx';

type Tab = 'path' | 'practice' | 'words' | 'profile';
type View =
  | { v: 'tab' }
  | { v: 'lesson'; node: PathNode; exercises: Exercise[]; run: string }
  | { v: 'complete'; title: string; run: string; stats: LessonStats }
  | { v: 'chapter'; section: number }
  | { v: 'about' };

export function App() {
  const [app, setApp] = useState<AppData | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('path');
  const [view, setView] = useState<View>({ v: 'tab' });
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [outbox, setOutbox] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => loadApp().then(setApp).catch((e: Error) => setErr(e.message));
  useEffect(() => { void reload(); }, []);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => { if (app) void outboxCount().then(setOutbox); }, [app?.events.length]);

  if (err) return <div class="screen"><main class="page"><h1>Vocābula</h1><p class="err" role="alert">{err}</p></main></div>;
  if (app === undefined) return <div class="splash"><span class="brand">Vocābula</span></div>;
  if (app === null) return <ImportScreen onImported={() => void reload()} />;

  const start = (node: PathNode) => {
    const exercises = lessonFor(app, node);
    setView({ v: 'lesson', node, exercises, run: uuid() });
  };

  if (view.v === 'lesson') {
    return (
      <Lesson app={app} node={view.node} exercises={view.exercises} run={view.run}
        onReview={(card, grade) => {
          void recordReview(app, card, grade, view.node.id, view.run).then((e) => setApp((a) => (a ? withEvents(a, [e]) : a)));
        }}
        onQuit={() => { setView({ v: 'tab' }); void reload(); }}
        onFinish={async (r: LessonResult) => {
          // Re-read the log so reviews recorded during the lesson are included before node_done.
          const fresh = (await loadApp())!;
          const next = await recordNodeDone(fresh, view.node.id, r.run, r.stats);
          setApp(next);
          setView({ v: 'complete', title: view.node.title, run: r.run, stats: r.stats });
        }} />
    );
  }
  if (view.v === 'complete') {
    return <Complete app={app} title={view.title} run={view.run} stats={view.stats} onContinue={() => { setTab('path'); setView({ v: 'tab' }); }} />;
  }
  if (view.v === 'chapter' || view.v === 'about') {
    const src = view.v === 'chapter' ? chapterText(view.section) : null;
    return (
      <div class="screen" data-screen={view.v}>
        <header class="lesson-head">
          <button type="button" class="iconbtn" aria-label="Back" onClick={() => setView({ v: 'tab' })}><IconBack /></button>
          <span class="lesson-tag" lang="la">{view.v === 'chapter' ? `Sectiō ${roman(view.section)}` : 'About'}</span>
        </header>
        <div class="scroll">
          {view.v === 'about' ? <AboutScreen /> : src ? <Markdown src={src} /> : <p class="page">This chapter isn’t written yet.</p>}
        </div>
      </div>
    );
  }

  const st = streakNow(app);
  const f = frontier(app);
  return (
    <div class="screen" data-screen={tab}>
      <header class="topbar">
        <span class="brand">Vocābula</span>
        <div class="chips">
          <span class="chip streak" title="Day streak" aria-label={`Day streak ${st.count}`}><IconFlame />{st.count}</span>
          <span class="chip puncta" title="Puncta" aria-label={`Puncta ${app.state.puncta}`}><IconStar />{app.state.puncta}</span>
          {!online && <span class="chip offline" title="Offline: everything still works; progress stays on this device"><IconCloudOff />Offline</span>}
        </div>
      </header>
      <div class="scroll">
        {tab === 'path' && <PathScreen app={app} onStart={start} onChapter={(s) => setView({ v: 'chapter', section: s })} />}
        {tab === 'practice' && (
          <main class="page" data-screen="practice">
            <h1 lang="la">Repetītiō</h1>
            <p>A review of everything you’ve met so far: due words first, then recent misses. It doesn’t move you along the path.</p>
            {f.index === 0
              ? <p class="note">Finish your first lesson on the path to unlock practice.</p>
              : <button type="button" class="btn" onClick={() => start(practiceNode(app))} data-testid="practice-start">Start review</button>}
          </main>
        )}
        {tab === 'words' && <WordsScreen app={app} />}
        {tab === 'profile' && <ProfileScreen app={app} setApp={setApp} outbox={outbox} onAbout={() => setView({ v: 'about' })} />}
      </div>
      <nav class="tabbar" aria-label="Main">
        {([['path', 'Path', IconPath], ['practice', 'Practice', IconPractice], ['words', 'Words', IconWords], ['profile', 'Profile', IconProfile]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon />{label}</button>
        ))}
      </nav>
    </div>
  );
}

export { PRACTICE_NODE };
