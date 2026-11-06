import Link from "next/link";

export default function NotFound() {
  return (
    <div className="state state-error">
      <title>Page not found · Helpforce</title>
      <h1>Page not found</h1>
      <p>There is no page at this address.</p>
      <Link className="button secondary" href="/">
        Go to home
      </Link>
    </div>
  );
}
