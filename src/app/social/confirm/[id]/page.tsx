import SocialConfirmClient from "@/components/SocialConfirmClient";

export default async function SocialConfirmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main>
      <nav>
        <a className="logo" href="/">XLAUNCH</a>
        <div className="navRule">SOCIAL LAUNCH CONFIRMATION</div>
        <a className="wallet tokenBack" href="/">XLAUNCH.IT</a>
      </nav>
      <SocialConfirmClient commandPostId={id} />
    </main>
  );
}
