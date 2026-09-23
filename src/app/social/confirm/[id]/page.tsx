import SocialConfirmClient from "@/components/SocialConfirmClient";

export default async function SocialConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token = "" } = await searchParams;

  return (
    <main>
      <nav>
        <a className="logo" href="/">XLAUNCH</a>
        <div className="navRule">SOCIAL LAUNCH CONFIRMATION</div>
        <a className="wallet tokenBack" href="/">XLAUNCH.IT</a>
      </nav>
      <SocialConfirmClient commandPostId={id} token={token} />
    </main>
  );
}
