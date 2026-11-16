import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";

export default function TodayAnnouncements({ slides }: { slides: { title: string; content: ReactNode }[] }) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    const update = () => setCurrent(api.selectedScrollSnap());
    update();
    api.on("select", update).on("reInit", update);
    return () => { api.off("select", update).off("reInit", update); };
  }, [api]);

  return <Carousel dir="rtl" aria-label="إعلانات النهارده" opts={{ direction: "rtl", align: "start" }} setApi={setApi}>
    <CarouselContent className="ml-0 -me-3 touch-pan-y">
      {slides.map(({ title, content }, index) => <CarouselItem key={title} aria-label={title} inert={index !== current} className="flex pe-3 pl-0 [&>section]:w-full">
        {content}
      </CarouselItem>)}
    </CarouselContent>
    <div className="mt-2 flex items-center justify-center gap-2">
      <Button type="button" size="icon" variant="outline" aria-label="الإعلان السابق"
        disabled={!api || current === 0} onClick={() => api?.scrollPrev()}><ChevronRight /></Button>
      {slides.map(({ title }, index) => <Button key={title} type="button" size="icon"
        variant="ghost" aria-label={title} aria-current={current === index ? "true" : undefined}
        className="size-8" onClick={() => api?.scrollTo(index)}>
        <span className={"size-2.5 rounded-full border border-primary " + (current === index ? "bg-primary" : "")} aria-hidden />
      </Button>)}
      <Button type="button" size="icon" variant="outline" aria-label="الإعلان التالي"
        disabled={!api || current >= slides.length - 1} onClick={() => api?.scrollNext()}><ChevronLeft /></Button>
    </div>
  </Carousel>;
}
