"use client";
import React, { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";

function PillBadge({ count, isActive }) {
  if (count === undefined) return null;

  const text = count === null ? '–' : String(count);
  const cls = isActive
    ? 'bg-white/20 text-white text-xs rounded-full px-2 py-0.5 min-w-[24px] text-center ml-2 tabular'
    : 'bg-surface-tertiary/50 text-content-tertiary text-xs rounded-full px-2 py-0.5 min-w-[24px] text-center ml-2 tabular';

  return <span className={cls}>{text}</span>;
}

function NavHeader({ tabs = [], activeTab, onTabChange }) {
  const [position, setPosition] = useState({
    left: 0,
    width: 0,
    opacity: 0,
  });

  const [activeTabPosition, setActiveTabPosition] = useState({
    left: 0,
    width: 0,
    opacity: 1,
  });

  return (
    <div className="flex items-center gap-2 px-6 py-4 border-b border-border-subtle/20 overflow-x-auto sticky top-0 z-20 bg-surface-primary/80 backdrop-blur-md">
      <ul
        className="relative mx-auto flex w-fit rounded-full border border-border-subtle bg-surface-secondary p-1.5"
        onMouseLeave={() => setPosition((pv) => ({ ...pv, opacity: 0 }))}
      >
        {tabs.map((tab) => (
          <Tab 
            key={tab.id} 
            setPosition={setPosition} 
            isActive={tab.id === activeTab}
            onClick={() => onTabChange(tab.id)}
            setActiveTabPosition={setActiveTabPosition}
          >
            <div className="flex items-center gap-2 px-2">
              <span className="text-base" aria-hidden="true">{tab.icon}</span>
              <span className="font-medium whitespace-nowrap">{tab.label}</span>
              <PillBadge count={tab.count} isActive={tab.id === activeTab} />
            </div>
          </Tab>
        ))}

        <Cursor position={position.opacity > 0 ? position : activeTabPosition} />
      </ul>
    </div>
  );
}

const Tab = ({ children, setPosition, isActive, onClick, setActiveTabPosition }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (isActive && ref.current) {
      const { width } = ref.current.getBoundingClientRect();
      setActiveTabPosition({
        width,
        opacity: 1,
        left: ref.current.offsetLeft,
      });
    }
  }, [isActive, setActiveTabPosition]);

  return (
    <li
      ref={ref}
      onMouseEnter={() => {
        if (!ref.current) return;
        const { width } = ref.current.getBoundingClientRect();
        setPosition({
          width,
          opacity: 1,
          left: ref.current.offsetLeft,
        });
      }}
      onClick={onClick}
      className={`relative z-10 block cursor-pointer px-4 py-2 text-sm transition-colors duration-200 ${
        isActive ? "text-white" : "text-content-secondary hover:text-content-primary"
      }`}
    >
      {children}
    </li>
  );
};

const Cursor = ({ position }) => {
  return (
    <motion.li
      animate={position}
      className="absolute z-0 h-[calc(100%-12px)] rounded-full bg-info top-1.5"
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
    />
  );
};

export default NavHeader;
