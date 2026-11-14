import type { Metadata } from "next";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <h1 className="text-2xl font-bold sm:text-3xl">About Life Stream</h1>

      <div className="flex flex-col gap-4 leading-relaxed text-foreground/90">
        <p>
          Life Stream is a music streaming service for Christian music. All songs have been
          gathered from public free sources such as other free streaming sites. The purpose of
          this site is:
        </p>
        <ul className="ml-1 flex list-disc flex-col gap-2 pl-5 marker:text-muted">
          <li>To separate these songs from all that the world offers on other platforms.</li>
          <li>To provide a service without advertising or subscription fees.</li>
        </ul>
        <p>
          If you are the creator of any of this music, you retain all rights and ownership. As a
          brother in the Body of Christ, the creator of Life Stream would beg you to permit your
          songs to continue to be shared with others through this service. These songs have
          rendered help to many believers, and it would be an honor to continue this. Please also
          note that no money is being earned from this site, and if anyone asks about donations
          we would direct them to the original producers of the music.
        </p>
      </div>

      <hr className="border-border" />

      <p className="text-sm italic text-muted">
        In loving memory of Josh, who listened to these songs all day, every day.
      </p>
    </div>
  );
}
