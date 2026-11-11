import { colorFor } from "@/lib/format";

export function Cover({
  title,
  artworkUrl,
  color,
  className = "",
  rounded = "rounded-lg",
}: {
  title: string;
  artworkUrl?: string | null;
  color?: string | null;
  className?: string;
  rounded?: string;
}) {
  if (artworkUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={artworkUrl}
        alt=""
        loading="lazy"
        className={`aspect-square w-full object-cover ${rounded} ${className}`}
      />
    );
  }
  const bg = color ?? colorFor(title);
  return (
    <div
      className={`flex aspect-square w-full select-none items-center justify-center p-[8%] text-center ${rounded} ${className}`}
      style={{
        background: `linear-gradient(135deg, ${bg}, color-mix(in srgb, ${bg} 55%, #05070a))`,
      }}
    >
      <span className="line-clamp-3 text-[clamp(0.6rem,1.4vw,0.95rem)] font-semibold leading-snug text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,.4)]">
        {title}
      </span>
    </div>
  );
}
