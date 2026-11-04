import { render } from 'preact';
import { App } from './ui/App.tsx';
import './ui/fonts.css';
import './ui/styles.css';

const root = document.getElementById('app');
if (root) render(<App />, root);
