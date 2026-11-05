/** App shell: routes between import, path, lesson, complete and tab pages. */
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  frontier, lessonFor, loadApp, settingOn, SETTING_AUTOPLAY, withEvents, practiceNode, recordFlag, recordNodeDone, recordReview, streakNow, PRACTICE_NODE, type AppData,
} from '../app/controller.ts';
import type { PathNode } from '../engine/path.ts';
import type { Exercise } from '../engine/lesson.ts';
import type { LessonStats } from '../engine/events.ts';
import { fetchPackFromServer } from '../data/contentStore.ts';
import { Syncer, syncLabel, type SyncStatus } from '../sync/sync.ts';
import { idbSyncStore } from '../sync/idbStore.ts';
import { signInAgain } from '../sync/http.ts';
import { uuid } from '../engine/util.ts';
import { audioAvailable, initAudioCache } from '../audio/player.ts';
import { setAudioReporter } from './AudioReport.tsx';
import { roman } from '../engine/curriculum.ts';
import { PathScreen } from './PathScreen.tsx';
import { Lesson, type LessonResult } from './Lesson.tsx';
import { Complete } from './Complete.tsx';
import { Markdown } from './Markdown.tsx';
import { AboutScreen, ImportScreen, ProfileScreen, WordsScreen } from './Pages.tsx';
import { COMPARE_HASH, ComparePage } from './Compare.tsx';
import { LectioReader } from './Lectio.tsx';
import { HistoriaEntryView, HistoriaList, IconScroll } from './Historia.tsx';
import { historiaNode } from '../engine/historia.ts';
import { IconBack, IconCloud, IconCloudOff, IconFlame, IconPath, IconPractice, IconProfile, IconStar, IconWords } from './icons.tsx';

type Tab = 'path' | 'practice' | 'words' | 'historia' | 'profile';
type View =
  | { v: 'tab' }
  | { v: 'lesson'; node: PathNode; exercises: Exercise[]; run: string }
  | { v: 'complete'; title: string; run: string; stats: LessonStats }
  | { v: 'chapter'; section: number }
  | { v: 'about' }
  | { v: 'lectio'; id: string }
  | { v: 'historia'; id: string; run: string };

/** One sync loop per page. */
let syncer: Syncer | null = null;
export function getSyncer(): Syncer {
  syncer ??= new Syncer({ store: idbSyncStore });
  return syncer;
}

export function App() {
  const [app, setApp] = useState<AppData | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('path');
  const [view, setView] = useState<View>({ v: 'tab' });
  const [sync, setSync] = useState<SyncStatus>({ state: 'idle', queued: 0 });
  const [err, setErr] = useState<string | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pendingReload = useRef(false);
  // Voice test (#/compare): a hidden page, reached from Profile.
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => { const f = () => setHash(location.hash); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);

  const reload = () => loadApp().then(setApp).catch((e: Error) => setErr(e.message));
  useEffect(() => { void reload(); void initAudioCache(); }, []);
  // "Bad audio" reports from any speaker (long-press): a flag event, synced like the others.
  useEffect(() => {
    if (!app) { setAudioReporter(null); return; }
    const cur = app;
    setAudioReporter((b) => { void recordFlag(cur, b).then((e) => setApp((x) => (x ? withEvents(x, [e]) : x))); });
    return () => setAudioReporter(null);
  }, [app]);

  const loaded = app !== undefined && app !== null;
  // Start syncing once content is present. Remote events re-run replay (deferred during a lesson).
  useEffect(() => {
    if (!loaded) return;
    const s = getSyncer();
    const unsub = s.subscribe(setSync);
    s.setOnPulled(() => {
      if (viewRef.current.v === 'lesson') pendingReload.current = true;
      else void reload();
    });
    const stop = s.start();
    // Never block start on the network: check for a newer pack in the background.
    void fetchPackFromServer().then((r) => { if (r.kind === 'updated') void reload(); });
    return () => { unsub(); stop(); s.setOnPulled(undefined); };
  }, [loaded]);
  useEffect(() => { if (loaded) void getSyncer().refreshQueued(); }, [app?.events.length]);

  const afterLesson = () => {
    pendingReload.current = false;
    void getSyncer().request();
  };

  if (hash === COMPARE_HASH) return <ComparePage onBack={() => { history.replaceState(null, '', location.pathname + location.search); setHash(''); }} />;
  if (err) return <div class="screen"><main class="page"><h1>Vocābula</h1><p class="err" role="alert">{err}</p></main></div>;
  if (app === undefined) return <div class="splash"><span class="brand">Vocābula</span></div>;
  if (app === null) return <ImportScreen onImported={() => void reload()} />;

  const start = (node: PathNode) => {
    const exercises = lessonFor(app, node, new Date(), { audioAvailable });
    setView({ v: 'lesson', node, exercises, run: uuid() });
  };

  if (view.v === 'lesson') {
    return (
      <Lesson app={app} node={view.node} exercises={view.exercises} run={view.run} autoplay={settingOn(app, SETTING_AUTOPLAY)}
        onReview={(card, grade) => {
          void recordReview(app, card, grade, view.node.id, view.run).then((e) => setApp((a) => (a ? withEvents(a, [e]) : a)));
        }}
        onFlag={(b) => { void recordFlag(app, b).then((e) => setApp((a) => (a ? withEvents(a, [e]) : a))); }}
        onQuit={() => { setView({ v: 'tab' }); void reload(); afterLesson(); }}
        onFinish={async (r: LessonResult) => {
          // Re-read the log so reviews recorded during the lesson are included before node_done.
          const fresh = (await loadApp())!;
          const next = await recordNodeDone(fresh, view.node.id, r.run, r.stats);
          setApp(next);
          setView({ v: 'complete', title: view.node.title, run: r.run, stats: r.stats });
          afterLesson();
        }} />
    );
  }
  if (view.v === 'complete') {
    return <Complete app={app} title={view.title} run={view.run} stats={view.stats} onContinue={() => { setTab('path'); setView({ v: 'tab' }); }} />;
  }
  if (view.v === 'lectio') {
    const p = app.bundled.lectio.find((x) => x.id === view.id);
    if (p) return <LectioReader app={app} p={p} onBack={() => setView({ v: 'tab' })} />;
  }
  if (view.v === 'historia') {
    return (
      <div class="screen" data-screen="historia-entry">
        <header class="lesson-head">
          <button type="button" class="iconbtn" aria-label="Back" onClick={() => { setView({ v: 'tab' }); afterLesson(); }}><IconBack /></button>
          <span class="lesson-tag" lang="la">Historia</span>
        </header>
        <div class="scroll">
          <HistoriaEntryView app={app} id={view.id}
            onReview={(card, grade) => {
              void recordReview(app, card, grade, historiaNode(view.id), view.run).then((e) => setApp((a) => (a ? withEvents(a, [e]) : a)));
            }} />
        </div>
      </div>
    );
  }
  if (view.v === 'chapter' || view.v === 'about') {
    return (
      <div class="screen" data-screen={view.v}>
        <header class="lesson-head">
          <button type="button" class="iconbtn" aria-label="Back" onClick={() => setView({ v: 'tab' })}><IconBack /></button>
          <span class="lesson-tag" lang="la">{view.v === 'chapter' ? `Sectiō ${roman(view.section)}` : 'About'}</span>
        </header>
        <div class="scroll">
          {view.v === 'about' ? <AboutScreen /> : <Markdown section={view.section} />}
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
          <SyncChip status={sync} />
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
        {tab === 'words' && <WordsScreen app={app} onLectio={(id) => setView({ v: 'lectio', id })} />}
        {tab === 'historia' && <HistoriaList app={app} onOpen={(id) => setView({ v: 'historia', id, run: uuid() })} />}
        {tab === 'profile' && (
          <ProfileScreen app={app} setApp={setApp} sync={sync} onSyncNow={() => void getSyncer().request()}
            onAbout={() => setView({ v: 'about' })} />
        )}
      </div>
      <nav class="tabbar" aria-label="Main">
        {([['path', 'Path', IconPath], ['practice', 'Practice', IconPractice], ['words', 'Words', IconWords], ['historia', 'Historia', IconScroll], ['profile', 'Profile', IconProfile]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon />{label}</button>
        ))}
      </nav>
    </div>
  );
}

function SyncChip({ status }: { status: SyncStatus }) {
  const label = syncLabel(status);
  const title = status.state === 'offline'
    ? 'Offline: everything still works; progress is queued on this device'
    : status.state === 'auth' ? 'Your sign-in expired. Tap to sign in again.' : status.message ?? label;
  if (status.state === 'auth') {
    return (
      <button type="button" class="chip sync auth" data-testid="sync-chip" data-state={status.state} title={title} onClick={signInAgain}>
        <IconCloudOff />{label}
      </button>
    );
  }
  const Icon = status.state === 'offline' || status.state === 'error' ? IconCloudOff : IconCloud;
  return <span class={`chip sync ${status.state}`} data-testid="sync-chip" data-state={status.state} title={title} role="status"><Icon />{label}</span>;
}

export { PRACTICE_NODE };
