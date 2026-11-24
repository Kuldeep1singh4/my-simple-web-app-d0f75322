import React, { useEffect, useRef } from "react";

export function TerminalConsole({
  consoleText,
  isVisible,
}: {
  consoleText: string;
  isVisible: boolean;
}) {
  const terminalScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = terminalScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [consoleText, isVisible]);

  return (
    <div
      ref={terminalScrollRef}
      className={`absolute inset-0 overflow-y-auto px-3 py-2 ${
        isVisible ? "block" : "hidden"
      }`}
      style={{
        background: "#1E1E1E",
        fontFamily: '"Fira Code", "Courier New", ui-monospace, monospace',
        fontSize: "12px",
        lineHeight: 1.5,
        color: "#D4D4D4",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {consoleText ? (
        <>
          {consoleText}
          <span className="inline-block w-2 h-3.5 align-text-bottom bg-gray-300 ml-0.5 animate-pulse" />
        </>
      ) : (
        <span style={{ color: "#6A6A6A" }}>
          &gt; Program output will appear here…
        </span>
      )}
    </div>
  );
}

