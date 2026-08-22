interface TopbarProps {
  label: string;
  onOpenMenu: () => void;
}

export function Topbar({ label, onOpenMenu }: TopbarProps) {
  return <header className="topbar"><button className="mobile-menu" onClick={onOpenMenu}>☰</button><div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{label}</strong></div><div className="top-actions"><button className="icon-button">?</button><button className="icon-button">⌘</button><div className="user-avatar">MK</div></div></header>;
}