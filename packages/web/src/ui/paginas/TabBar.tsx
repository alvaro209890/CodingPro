import { useCallback } from "react";

interface Tab {
  id: string;
  ico: string;
  lbl: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onSelect: (id: string) => void;
  isMobile?: boolean;
}

export function TabBar({ tabs, activeTab, onSelect, isMobile }: TabBarProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIdx: number) => {
      let nextIdx = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        nextIdx = (currentIdx + 1) % tabs.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
      } else if (e.key === "Home") {
        e.preventDefault();
        nextIdx = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        nextIdx = tabs.length - 1;
      }
      if (nextIdx >= 0) {
        const nextTab = tabs[nextIdx];
        if (nextTab) onSelect(nextTab.id);
      }
    },
    [tabs, onSelect],
  );

  return (
    <nav
      className={`playground__tabbar ${isMobile ? "playground__tabbar--mobile" : "playground__tabbar--desktop"}`}
      role="tablist"
      aria-label="Abas do playground"
    >
      <div className="playground__tabbarInner">
        {tabs.map((t, idx) => {
          const isActive = t.id === activeTab;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={`playground__tab ${isActive ? "playground__tab-ativo" : ""}`}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              type="button"
            >
              <span className="playground__tabIcon" aria-hidden="true">{t.ico}</span>
              <span className="playground__tabLabel">{t.lbl}</span>
              {isActive && <span className="playground__tabGlowDot" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}