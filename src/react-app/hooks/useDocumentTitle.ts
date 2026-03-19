import { useEffect } from 'react';

/**
 * SEO Metadata Hook
 * 
 * Updates document title and meta tags dynamically for better SEO.
 * Non-destructive - only modifies head metadata, no routing changes.
 */

const DEFAULT_TITLE = 'GZ Sports - Live Scores, AI Analysis & Sports Pools';
const DEFAULT_DESCRIPTION = 'Premium sports intelligence network with live scores, Coach G AI analysis, and pool management. Real-time NFL, NBA, MLB, NHL coverage.';

interface DocumentMetaOptions {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  keywords?: string;
}

/**
 * Hook to update document title
 */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    const previousTitle = document.title;
    
    if (title) {
      document.title = `${title} | GZ Sports`;
    } else {
      document.title = DEFAULT_TITLE;
    }
    
    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}

/**
 * Hook to update full document metadata (title + meta tags)
 */
export function useDocumentMeta(options: DocumentMetaOptions) {
  useEffect(() => {
    const {
      title,
      description,
      ogTitle,
      ogDescription,
      ogImage,
      ogUrl,
      keywords
    } = options;
    
    // Store original values for cleanup
    const originalTitle = document.title;
    const originalMetas: { element: HTMLMetaElement; content: string }[] = [];
    
    // Update title
    if (title) {
      document.title = `${title} | GZ Sports`;
    }
    
    // Helper to update meta tag
    const updateMeta = (selector: string, content: string) => {
      const meta = document.querySelector<HTMLMetaElement>(selector);
      if (meta) {
        originalMetas.push({ element: meta, content: meta.content });
        meta.content = content;
      }
    };
    
    // Update meta tags
    if (description) {
      updateMeta('meta[name="description"]', description);
    }
    
    if (keywords) {
      updateMeta('meta[name="keywords"]', keywords);
    }
    
    if (ogTitle) {
      updateMeta('meta[property="og:title"]', ogTitle);
      updateMeta('meta[name="twitter:title"]', ogTitle);
    }
    
    if (ogDescription) {
      updateMeta('meta[property="og:description"]', ogDescription);
      updateMeta('meta[name="twitter:description"]', ogDescription);
    }
    
    if (ogImage) {
      updateMeta('meta[property="og:image"]', ogImage);
      updateMeta('meta[name="twitter:image"]', ogImage);
    }
    
    if (ogUrl) {
      updateMeta('meta[property="og:url"]', ogUrl);
    }
    
    // Cleanup on unmount
    return () => {
      document.title = originalTitle;
      originalMetas.forEach(({ element, content }) => {
        element.content = content;
      });
    };
  }, [options.title, options.description, options.ogTitle, options.ogDescription, options.ogImage, options.ogUrl, options.keywords]);
}

/**
 * Page-specific metadata presets
 */
export const PAGE_META = {
  home: {
    title: undefined, // Use default
    description: DEFAULT_DESCRIPTION,
  },
  scores: {
    title: 'Live Scores',
    description: 'Real-time live scores for NFL, NBA, MLB, NHL, college football, and more. Get instant updates and game details.',
    keywords: 'live scores, NFL scores, NBA scores, MLB scores, NHL scores, real-time scores, sports scores',
  },
  pools: {
    title: 'Sports Pools',
    description: 'Create and join survivor pools, pick\'em pools, and more. Compete with friends in NFL, NBA, and other sports pools.',
    keywords: 'survivor pools, pick em pools, sports pools, NFL pools, fantasy sports, office pools',
  },
  pricing: {
    title: 'Pricing & Plans',
    description: 'Choose the GZ Sports plan that fits your needs. Free tier available. Pro and Elite tiers for serious sports fans.',
    keywords: 'GZ Sports pricing, sports app subscription, Pro tier, Elite tier, sports intelligence pricing',
  },
  settings: {
    title: 'Settings',
    description: 'Manage your GZ Sports account settings, notifications, and preferences.',
  },
  alerts: {
    title: 'Alert Center',
    description: 'Your personalized sports alerts. Score updates, line movements, injury reports, and custom alerts.',
    keywords: 'sports alerts, score alerts, line movement alerts, injury alerts, push notifications',
  },
  commandCenter: {
    title: 'Command Center',
    description: 'Elite multi-game monitoring dashboard. Track all your games in one view with real-time updates.',
    keywords: 'command center, multi-game view, live monitoring, sports dashboard, elite features',
  },
} as const;
