import Seo from '../../components/seo/Seo'
import Nav from '../../components/marketing/Nav'
import Footer from '../../components/marketing/Footer'
import FinalCta from '../../components/marketing/FinalCta'
import { Section, SectionHead } from '../../components/marketing/Section'
import VideoSection from '../../components/marketing/VideoSection'
import TourHighlights from '../../components/marketing/TourHighlights'
import ProductTour from '../../components/marketing/ProductTour'
import FeatureGroup from '../../components/marketing/FeatureGroup'
import ComparisonTable from '../../components/marketing/ComparisonTable'
import { LANDING_VIDEOS } from '../../content/landingVideos'
import { FEATURE_GROUPS } from '../../content/featureGroups'
import {
  breadcrumbSchema,
  organizationSchema,
  softwareApplicationSchema,
  videoObjectSchema,
} from '../../lib/seo'

/**
 * The product deep-dive: everything that used to make the homepage long.
 *
 * The homepage keeps only the booking-flow video and a condensed feature
 * teaser (FeatureTeaser) — this page carries the signup and system-tour
 * videos, the interactive tour, the full ruled feature breakdown, and the
 * category comparison table, all linked from the homepage's teaser and from
 * Nav's "المنتج" link.
 */
export default function ProductPage() {
  // Only signup + tour videos live here — the booking video stays on the
  // homepage as the primary "how it works" hook.
  const pageVideos = [LANDING_VIDEOS.signup, LANDING_VIDEOS.tour]
  const videoSchemas = pageVideos.map((video) =>
    videoObjectSchema({
      name: video.title,
      description: video.lead,
      youtubeId: video.youtubeId,
      uploadDate: video.uploadDate,
      duration: video.duration,
    })
  )

  return (
    <div className="min-h-screen bg-paper text-ink font-sans antialiased" dir="rtl">
      <Seo
        title="المنتج — جولة في نظام بسهولة ومقارنة بالبدائل"
        description="جولة تفاعلية في نظام بسهولة: الحجز والمواعيد، تذكير الواتساب، متابعة العملاء، الملف الطبي، التقارير — ومقارنة صريحة بمنصات الحجز العالمية."
        path="/product"
        schemas={[
          organizationSchema(),
          softwareApplicationSchema(),
          breadcrumbSchema([{ name: 'الرئيسية', path: '/' }, { name: 'المنتج' }]),
          ...videoSchemas,
        ]}
      />

      <Nav />

      <main>
        <Section tone="ink">
          <SectionHead
            as="h1"
            onDark
            title="كل حاجة النظام بيعملها، من جوه"
            lead="جولة تفاعلية، فيديوهات، وتفصيل كامل للمميزات — ومقارنة صريحة بمنصات الحجز العالمية، بما فيها اللي إحنا مش بنعمله."
          />
        </Section>

        <VideoSection
          id={LANDING_VIDEOS.signup.id}
          tone="surface"
          title={LANDING_VIDEOS.signup.title}
          lead={LANDING_VIDEOS.signup.lead}
          youtubeId={LANDING_VIDEOS.signup.youtubeId}
          stepsTitle={LANDING_VIDEOS.signup.stepsTitle}
          steps={LANDING_VIDEOS.signup.steps}
          cta={LANDING_VIDEOS.signup.cta}
        />

        <VideoSection
          id={LANDING_VIDEOS.tour.id}
          tone="paper"
          title={LANDING_VIDEOS.tour.title}
          lead={LANDING_VIDEOS.tour.lead}
          youtubeId={LANDING_VIDEOS.tour.youtubeId}
          stepsTitle={LANDING_VIDEOS.tour.stepsTitle}
          steps={LANDING_VIDEOS.tour.steps}
        >
          <TourHighlights />
        </VideoSection>

        <ProductTour id="tour" />

        <Section id="features" tone="surface">
          <SectionHead
            title="المميزات بالتفصيل"
            lead="كل سطر تحت موجود في النظام دلوقتي. واللي مش موجود مكتوب صريح في جدول المقارنة وفي الأسئلة."
          />
          <div className="mt-10">
            {FEATURE_GROUPS.map((group) => (
              <FeatureGroup key={group.title} {...group} />
            ))}
          </div>
        </Section>

        <ComparisonTable id="compare" />
        <FinalCta />
      </main>

      <Footer />
    </div>
  )
}
