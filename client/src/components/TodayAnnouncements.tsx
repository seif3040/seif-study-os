import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";

export default function TodayAnnouncements({ slides }: { slides: { title: string; content: ReactNode }[] }) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [autoplay, setAutoplay] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const slideNodes = useRef<(HTMLDivElement | null)[]>([]);
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    const content = slideNodes.current[current]?.firstElementChild;
    if (!content) return;
    const measure = () => setHeight(Math.ceil(content.getBoundingClientRect().height));
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(content);
    return () => resize.disconnect();
  }, [current]);

  useEffect(() => {
    if (!api) return;
    const update = () => setCurrent(api.selectedScrollSnap());
    update();
    api.on("select", update).on("reInit", update);
    return () => { api.off("select", update).off("reInit", update); };
  }, [api]);

  useEffect(() => {
    if (!api || !autoplay || hovered || focused || dragging || slides.length < 2) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) api.scrollNext();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [api, autoplay, current, hovered, focused, dragging, slides.length]);

  return <Carousel dir="rtl" aria-label="إعلانات النهارده" opts={{ direction: "rtl", align: "start", loop: true }} setApi={setApi}>
    <div className="overflow-hidden motion-safe:transition-[height]" style={height ? { height } : undefined}>
    <CarouselContent className="ml-0 -me-3 items-start touch-pan-y"
      onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => { setHovered(false); setDragging(false); }}
      onPointerDown={() => setDragging(true)} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}
      onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      {slides.map(({ title, content }, index) => <CarouselItem key={title} aria-label={title} inert={index !== current} ref={node => { slideNodes.current[index] = node; }}
        className="flex pe-3 pl-0 [&>*]:w-full">
        {content}
      </CarouselItem>)}
    </CarouselContent>
    </div>
    <div className="mt-2 flex items-center justify-center gap-2">
      <Button type="button" size="icon" variant="outline" aria-label="الإعلان السابق"
        disabled={!api || slides.length < 2} onClick={() => api?.scrollPrev()}><ChevronRight /></Button>
      {slides.map(({ title }, index) => <Button key={title} type="button" size="icon"
        variant="ghost" aria-label={title} aria-current={current === index ? "true" : undefined}
        className="size-8" onClick={() => api?.scrollTo(index)}>
        <span className={"size-2.5 rounded-full border border-primary " + (current === index ? "bg-primary" : "")} aria-hidden />
      </Button>)}
      <Button type="button" size="icon" variant="outline" aria-label="الإعلان التالي"
        disabled={!api || slides.length < 2} onClick={() => api?.scrollNext()}><ChevronLeft /></Button>
      <Button type="button" size="icon" variant="outline" aria-label={autoplay ? "أوقف التقليب التلقائي" : "شغّل التقليب التلقائي"}
        onClick={() => setAutoplay(value => !value)}>{autoplay ? <Pause /> : <Play />}</Button>
    </div>
  </Carousel>;
}
