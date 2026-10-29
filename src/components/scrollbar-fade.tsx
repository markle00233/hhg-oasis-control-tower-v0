"use client";

import { useEffect } from "react";

type Axis = "x" | "y";

/** Overlay thumbs that fade in while a surface moves and fade out when it stops. */
export function ScrollbarFade() {
  useEffect(() => {
    const owners = new WeakMap<Element, string>();
    const hideTimers = new WeakMap<Element, number>();
    const timers = new Set<number>();
    let nextId = 0;
    let frame = 0;
    let pending: Element | null = null;

    function ownerId(el: Element) {
      let id = owners.get(el);
      if (!id) {
        id = String(++nextId);
        owners.set(el, id);
      }
      return id;
    }

    function makeThumb(axis: Axis) {
      const node = document.createElement("div");
      node.className = "scrollbar-fade-thumb";
      node.dataset.axis = axis;
      document.body.appendChild(node);
      return node;
    }

    const thumbs: Record<Axis, HTMLDivElement> = {
      x: makeThumb("x"),
      y: makeThumb("y"),
    };

    function place(el: Element, axis: Axis, rect: DOMRect | {
      top: number;
      left: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    }) {
      const node = thumbs[axis];
      const id = ownerId(el);
      const max =
        axis === "y"
          ? el.scrollHeight - el.clientHeight
          : el.scrollWidth - el.clientWidth;
      if (max <= 2 || rect.width < 8 || rect.height < 8) {
        if (node.dataset.owner === id) node.classList.remove("is-on");
        return;
      }
      const view = axis === "y" ? rect.height : rect.width;
      const scrollSize = axis === "y" ? el.scrollHeight : el.scrollWidth;
      const size = Math.max(28, Math.min(view - 8, (view / scrollSize) * view));
      const travel = Math.max(0, view - size - 8);
      const pos =
        ((axis === "y" ? el.scrollTop : el.scrollLeft) / max) * travel;
      if (axis === "y") {
        node.style.width = "6px";
        node.style.height = `${size}px`;
        node.style.top = `${rect.top + 4 + pos}px`;
        node.style.left = `${rect.right - 10}px`;
      } else {
        node.style.height = "6px";
        node.style.width = `${size}px`;
        node.style.top = `${rect.bottom - 10}px`;
        node.style.left = `${rect.left + 4 + pos}px`;
      }
      node.dataset.owner = id;
      if (!node.classList.contains("is-on")) {
        requestAnimationFrame(() => {
          if (node.dataset.owner === id) node.classList.add("is-on");
        });
      }
    }

    function mark(el: Element) {
      const maxY = el.scrollHeight - el.clientHeight;
      const maxX = el.scrollWidth - el.clientWidth;
      if (maxY <= 2 && maxX <= 2) return;
      const root = document.scrollingElement || document.documentElement;
      const rect =
        el === root || el === document.documentElement || el === document.body
          ? {
              top: 0,
              left: 0,
              right: window.innerWidth,
              bottom: window.innerHeight,
              width: window.innerWidth,
              height: window.innerHeight,
            }
          : el.getBoundingClientRect();
      place(el, "x", rect);
      place(el, "y", rect);
      const prev = hideTimers.get(el);
      if (prev) {
        window.clearTimeout(prev);
        timers.delete(prev);
      }
      const id = ownerId(el);
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        hideTimers.delete(el);
        for (const node of Object.values(thumbs)) {
          if (node.dataset.owner === id) node.classList.remove("is-on");
        }
      }, 650);
      timers.add(timer);
      hideTimers.set(el, timer);
    }

    function onScroll(event: Event) {
      const target = event.target;
      pending =
        target instanceof Element
          ? target
          : document.scrollingElement || document.documentElement;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = pending;
        pending = null;
        if (el) mark(el);
      });
    }

    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      if (frame) cancelAnimationFrame(frame);
      for (const timer of timers) window.clearTimeout(timer);
      thumbs.x.remove();
      thumbs.y.remove();
    };
  }, []);

  return null;
}
