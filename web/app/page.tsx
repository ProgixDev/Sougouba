import { WovenBand } from '@/components/ui';
import { Nav } from '@/components/site/Nav';
import { Footer } from '@/components/site/Footer';
import { StickyCta } from '@/components/site/StickyCta';
import { Hero } from '@/components/sections/Hero';
import { Proof } from '@/components/sections/Proof';
import { Verticals } from '@/components/sections/Verticals';
import { IngredientWall } from '@/components/sections/IngredientWall';
import { HowItWorks } from '@/components/sections/HowItWorks';
import { LiveTracking } from '@/components/sections/LiveTracking';
import { ThreeApps } from '@/components/sections/ThreeApps';
import { Merchant } from '@/components/sections/Merchant';
import { Courier } from '@/components/sections/Courier';
import { Receipt } from '@/components/sections/Receipt';
import { FinalCta } from '@/components/sections/FinalCta';

/**
 * The page is the brand film unrolled down a scroll: an empty basket that fills,
 * then goes online. The basket in the nav fills as each marked section passes; the
 * final CTA is the film's last frame, full, with the signal arc firing.
 *
 * The woven band is the only divider. It replaces every rule, gradient blob and
 * decorative shape the page would otherwise reach for.
 */
export default function Home() {
  return (
    <>
      <Nav />
      <main id="contenu">
        <Hero />
        <WovenBand height={22} />
        <Proof />
        <Verticals />
        <IngredientWall />
        <HowItWorks />
        <WovenBand height={22} />
        <LiveTracking />
        <ThreeApps />
        <Merchant />
        <Courier />
        <WovenBand height={22} />
        <Receipt />
        <FinalCta />
      </main>
      <Footer />
      <StickyCta />
    </>
  );
}
