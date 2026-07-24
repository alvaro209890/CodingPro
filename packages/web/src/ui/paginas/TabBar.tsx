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
  return (
    <nav
      className={`playground__tabbar ${isMobile ? "playground__tabbar--mobile" : "playground__tabbar--desktop"}`}
      role="tablist"
      aria-label="Abas do playground"
    >
      <div className="playground__tabbarInner">
        {tabs.map((t) => {
          const isActive = t.id === activeTab;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={`playground__tab ${isActive ? "playground__tab-ativo" : ""}`}
              onClick={() => onSelect(t.id)}
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