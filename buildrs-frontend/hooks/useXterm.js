import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

const THEME = {
  background: '#1e1e1e',
  foreground: '#cccccc',
  cursor: '#ffffff',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

export function useXterm(containerId, options = {}) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof Terminal === 'undefined') {
      console.error('xterm.js not loaded. Include: <script src="https://unpkg.com/xterm@5.3.0/lib/xterm.js"></script>');
      return;
    }

    const container = document.getElementById(containerId);
    if (!container) return;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: THEME,
      cols: options.cols || 80,
      rows: options.rows || 24,
      scrollback: 1000,
      ...options,
    });

    terminalRef.current = terminal;

    if (typeof FitAddon !== 'undefined' && FitAddon.FitAddon) {
      const fitAddon = new FitAddon.FitAddon();
      fitAddonRef.current = fitAddon;
      terminal.loadAddon(fitAddon);
    }

    if (typeof WebLinksAddon !== 'undefined' && WebLinksAddon.WebLinksAddon) {
      terminal.loadAddon(new WebLinksAddon.WebLinksAddon());
    }

    terminal.open(container);

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [containerId, options.cols, options.rows]);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  const write = useCallback((data) => {
    terminalRef.current?.write(data);
  }, []);

  const writeln = useCallback((data) => {
    terminalRef.current?.writeln(data);
  }, []);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const resize = useCallback((cols, rows) => {
    terminalRef.current?.resize(cols, rows);
    fitAddonRef.current?.fit();
  }, []);

  return {
    terminal: terminalRef.current,
    containerRef,
    fit,
    write,
    writeln,
    clear,
    resize,
  };
}
