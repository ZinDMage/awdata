"use client";
import React, { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";

function PillTabs({ options = [], activeKey, onKeyChange, size = "sm" }) {
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
    <ul
      className="relative flex w-fit rounded-full border border-border-subtle bg-surface-secondary p-1"
      onMouseLeave={() => setPosition((pv) => ({ ...pv, opacity: 0 }))}
    >
      {options.map((opt) => (
        <Tab 
          key={opt.key} 
          setPosition={setPosition} 
          isActive={opt.key === activeKey}
          onClick={() => onKeyChange(opt.key)}
          setActiveTabPosition={setActiveTabPosition}
          size={size}
        >
          {opt.label}
        </Tab>
      ))}

      <Cursor position={position.opacity > 0 ? position : activeTabPosition} />
    </ul>
  );
}

const Tab = ({ children, setPosition, isActive, onClick, setActiveTabPosition, size }) => {
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

  const sizeClasses = size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm";

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
      className={`relative z-10 block cursor-pointer font-medium transition-colors duration-200 whitespace-nowrap ${sizeClasses} ${
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
      className="absolute z-0 h-[calc(100%-8px)] rounded-full bg-info top-1"
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
    />
  );
};

export default PillTabs;
