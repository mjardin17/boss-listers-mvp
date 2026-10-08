// The bare site address used to 404. Send it to the Capture page, which in turn
// sends anyone who is not logged in to /login (see lib/clientAuth.js requireSession).
export function getServerSideProps() {
  return { redirect: { destination: "/capture", permanent: false } };
}

export default function Home() {
  return null;
}
