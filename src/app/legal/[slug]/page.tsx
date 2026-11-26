import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { legalPages } from "@/data/site";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return Object.keys(legalPages).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const page = legalPages[slug];
  return { title: page?.title ?? "Not found" };
}

/** Placeholder destination so footer/legal links never 404 until the real documents exist. */
export default async function LegalPlaceholderPage({ params }: { params: Params }) {
  const { slug } = await params;
  const page = legalPages[slug];
  if (!page) notFound();
  return (
    <>
      <Header />
      <main id="main" className="bg-cream py-24 text-ink">
        <Container className="max-w-2xl">
          <h1 className="font-display text-4xl tracking-[-0.03em]">{page.title}</h1>
          {slug === "refunds" ? (
            <div className="mt-4 space-y-4 text-lg text-muted">
              <p>Contact ThinkOva support to request a refund. We review requests before starting a refund through Cashfree.</p>
              <p>For the Demo Day guarantee, the student must attend at least six of eight classes and the tutor must confirm that their project did not complete the two agreed tasks on Demo Day.</p>
              <p>For a paid-in-full order, the guarantee covers half the amount paid. For an installment plan, it covers the second installment once paid. Partial refunds preserve enrollment access. A refund of all amounts paid ends access.</p>
              <p>Standard refunds are expected to reach the original payment method in five to seven business days after initiation.</p>
            </div>
          ) : slug === "terms" ? (
            <div className="mt-4 space-y-4 text-lg text-muted">
              <p>A parent or guardian enrolls the student and approves the course, fees, and safety terms.</p>
              <p>Pay the full fee at checkout or choose the two-part plan. The first installment is ₹3,000, the total is ₹500 above the full fee, and the balance is due by Level 5.</p>
              <p>Payment confirmation activates enrollment. The refund page explains how to request a refund.</p>
            </div>
          ) : (
            <p className="mt-4 text-lg leading-relaxed text-muted">
              {page.note} will be published here.
            </p>
          )}
          {slug === "curriculum" && (
            <div className="mt-6">
              <a
                href="/downloads/ThinkOva-Eight-Week-Curriculum.pdf"
                download="ThinkOva Eight-Week Curriculum.pdf"
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-white shadow-sm transition hover:brightness-105"
              >
                Download ThinkOva Eight-Week Curriculum (PDF)
              </a>
            </div>
          )}
          <div className="mt-8"><ButtonLink href="/" variant="dark">Back to home</ButtonLink></div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
