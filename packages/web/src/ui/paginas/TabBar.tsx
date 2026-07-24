import type { CSSProperties } from "react";

interface Tab {
  id: string;
  ico: string;
  lbl: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onSelect: (id: string) => void;
}

export function TabBar({ tabs, activeTab, onSelect }: TabBarProps) {
  return (
    <div className="playground__tabbar" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === activeTab}
          className={`playground__tab${t.id === activeTab ? " playground__tab-ativo" : ""}`}
          onClick={() => onSelect(t.id)}
          type="button"
        >
          <span className="playground__tabIcon">{t.ico}</span> {t.lbl}
        </button>
      ))}
    </div>
  );
}