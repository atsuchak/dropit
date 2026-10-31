import { UploadForm } from '@/features/shares/components/upload-form'
import Link from 'next/link'

export default function Home() {
  return (
    <main className="site-shell">
      <header className="site-header">
        <Link className="brand" href="/">
          DROPIT<span>●</span>
        </Link>
        <span>Temporary by design.</span>
      </header>
      <UploadForm />
      <footer>Simple. Private. Gone when it should be.</footer>
    </main>
  )
}
