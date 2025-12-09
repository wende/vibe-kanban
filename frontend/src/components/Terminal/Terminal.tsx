import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import './terminal.css';

interface TerminalProps {
  cwd?: string;
  className?: string;
  isVisible?: boolean;
  onClose?: () => void;
}

export function Terminal({
  cwd,
  className,
  isVisible = true,
  onClose,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onCloseRef = useRef(onClose);
  const isVisibleRef = useRef(isVisible);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Keep visibility ref updated
  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);

  // Keep onClose ref updated
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Track when we first become visible to trigger initialization
  // Use a small delay to ensure the container has proper dimensions
  useEffect(() => {
    if (isVisible && !hasInitialized) {
      const timer = setTimeout(() => {
        setHasInitialized(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isVisible, hasInitialized]);

  // Initialize terminal and WebSocket once, but only after first visible
  useEffect(() => {
    if (!hasInitialized || !containerRef.current) return;

    // Create terminal
    const terminal = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily:
        '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, "Cascadia Code", "Roboto Mono", Consolas, "DejaVu Sans Mono", monospace',
      fontWeight: '400',
      fontWeightBold: '600',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78',
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
      },
    });

    terminalRef.current = terminal;

    // Load fit addon
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);

    // Try to load WebGL addon for better performance
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      terminal.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL addon failed to load, using canvas renderer');
    }

    // Open terminal in container
    terminal.open(containerRef.current);
    console.log(
      '[Terminal] Opened in container, size:',
      containerRef.current.offsetWidth,
      'x',
      containerRef.current.offsetHeight
    );

    // Initial fit after a short delay to ensure container is sized
    setTimeout(() => {
      fitAddon.fit();
      console.log(
        '[Terminal] After fit - cols:',
        terminal.cols,
        'rows:',
        terminal.rows
      );
    }, 50);

    // Connect WebSocket after fit so we get proper dimensions
    setTimeout(() => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams({
        cols: String(terminal.cols || 80),
        rows: String(terminal.rows || 24),
        ...(cwd && { cwd }),
      });

      const wsUrl = `${protocol}//${window.location.host}/api/terminal/ws?${params}`;
      console.log('[Terminal] Connecting to:', wsUrl);
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Terminal] WebSocket connected');
        terminal.focus();
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const data = new Uint8Array(event.data);
          console.log('[Terminal] Received data:', data.length, 'bytes');
          terminal.write(data);
        }
      };

      ws.onclose = (event) => {
        console.log('[Terminal] WebSocket closed:', event.code, event.reason);
        terminal.write('\r\n\x1b[31m[Connection closed]\x1b[0m\r\n');
        onCloseRef.current?.();
      };

      ws.onerror = (error) => {
        console.error('[Terminal] WebSocket error:', error);
        terminal.write('\r\n\x1b[31m[Connection error]\x1b[0m\r\n');
      };
    }, 100);

    // Handle terminal input -> send to WebSocket
    const dataDisposable = terminal.onData((data: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // Send as binary
        wsRef.current.send(new TextEncoder().encode(data));
      }
    });

    // Handle terminal resize -> send to WebSocket
    const resizeDisposable = terminal.onResize(
      ({ cols, rows }: { cols: number; rows: number }) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      }
    );

    // Setup resize observer for container size changes
    // Only resize when visible to avoid bad dimensions when collapsed
    const resizeObserver = new ResizeObserver((entries) => {
      if (!isVisibleRef.current) return;
      const entry = entries[0];
      if (!entry || entry.contentRect.height === 0) return;
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit();
      }
    });
    resizeObserver.observe(containerRef.current);

    // Cleanup
    return () => {
      dataDisposable.dispose();
      resizeDisposable.dispose();
      resizeObserver.disconnect();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [hasInitialized, cwd]);

  // Re-fit when becoming visible again
  useEffect(() => {
    if (isVisible && fitAddonRef.current && terminalRef.current) {
      // Small delay to ensure CSS has applied
      setTimeout(() => {
        fitAddonRef.current?.fit();
        terminalRef.current?.focus();
      }, 50);
    }
  }, [isVisible]);

  // Re-fit and focus when becoming visible
  const handleContainerClick = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      onClick={handleContainerClick}
      style={{
        height: '100%',
        width: '100%',
        backgroundColor: '#1e1e1e',
      }}
    />
  );
}
