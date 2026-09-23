import ProfileClient from "@/components/ProfileClient";

export default function ProfilePage() {
  return (
    <main>
      <nav>
        <a className="logo" href="/">XLAUNCH</a>
        <div className="navRule">PROFILE / WALLET / FEES</div>
        <a className="wallet tokenBack" href="/">LAUNCH</a>
      </nav>
      <ProfileClient />
    </main>
  );
}
