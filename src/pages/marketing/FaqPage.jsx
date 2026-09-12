import Seo from '../../components/seo/Seo'
import Nav from '../../components/marketing/Nav'
import Footer from '../../components/marketing/Footer'
import FinalCta from '../../components/marketing/FinalCta'
import FAQ from '../../components/marketing/FAQ'
import { FAQS } from '../../content/faqs'
import { breadcrumbSchema, faqSchema, organizationSchema } from '../../lib/seo'

/**
 * The full FAQ list as its own page. The homepage shows only the first four
 * (via <FAQ limit={4} />) with a link here — this page renders the whole set
 * and is what src/lib/seo.js's faqSchema(FAQS) (the complete list) matches.
 */
export default function FaqPage() {
  return (
    <div className="min-h-screen bg-paper text-ink font-sans antialiased" dir="rtl">
      <Seo
        title="الأسئلة الشائعة عن بسهولة"
        description="إجابات مباشرة: إزاي تعمل حساب، هل التذكير تلقائي، فيه عمولة، بياناتك آمنة إزاي، ولو وقفت الاشتراك بياناتك بتروح فين."
        path="/faq"
        schemas={[
          organizationSchema(),
          faqSchema(FAQS),
          breadcrumbSchema([{ name: 'الرئيسية', path: '/' }, { name: 'الأسئلة الشائعة' }]),
        ]}
      />

      <Nav />

      <main>
        <FAQ title="الأسئلة الشائعة" headingLevel="h1" />
        <FinalCta />
      </main>

      <Footer />
    </div>
  )
}
