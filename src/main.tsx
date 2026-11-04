import { render } from 'preact';
import { App } from './ui/App.tsx';
import { applyTheme, getThemePref } from './ui/theme.ts';
import './ui/fonts.css';
import './ui/styles.css';

applyTheme(getThemePref());

const root = document.getElementById('app');
if (root) render(<App />, root);
