import { useEffect } from "react";

export function useReveal(ready: boolean) {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.08 },
    );
    document.querySelectorAll(".reveal:not(.revealed)").forEach((element) => {
      // Already visible content is never hidden again when data loads.
      if (element.getBoundingClientRect().top < innerHeight)
        element.classList.add("revealed");
      else {
        element.classList.add("reveal-pending");
        observer.observe(element);
      }
    });
    return () => {
      observer.disconnect();
      document
        .querySelectorAll(".reveal-pending")
        .forEach((e) => e.classList.remove("reveal-pending"));
    };
  }, [ready]);
}
