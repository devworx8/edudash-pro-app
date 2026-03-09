import { Platform } from 'react-native';

export interface SEOMetadata {
  title: string;
  description: string;
  keywords?: string[];
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: 'summary' | 'summary_large_image';
  canonicalUrl?: string;
}

export const setPageMetadata = (metadata: SEOMetadata) => {
  if (Platform.OS !== 'web') return;

  try {
    // Set document title
    if (typeof document !== 'undefined') {
      document.title = metadata.title;
      
      // Update or create meta tags
      const updateMetaTag = (name: string, content: string, property = false) => {
        const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
        let tag = document.querySelector(selector) as HTMLMetaElement;
        
        if (!tag) {
          tag = document.createElement('meta');
          if (property) {
            tag.setAttribute('property', name);
          } else {
            tag.setAttribute('name', name);
          }
          document.head.appendChild(tag);
        }
        
        tag.setAttribute('content', content);
      };

      // Basic meta tags
      updateMetaTag('description', metadata.description);
      
      if (metadata.keywords) {
        updateMetaTag('keywords', metadata.keywords.join(', '));
      }

      // Open Graph meta tags
      updateMetaTag('og:title', metadata.ogTitle || metadata.title, true);
      updateMetaTag('og:description', metadata.ogDescription || metadata.description, true);
      updateMetaTag('og:type', 'website', true);
      
      if (metadata.ogImage) {
        updateMetaTag('og:image', metadata.ogImage, true);
      }

      // Twitter Card meta tags
      updateMetaTag('twitter:card', metadata.twitterCard || 'summary_large_image');
      updateMetaTag('twitter:title', metadata.ogTitle || metadata.title);
      updateMetaTag('twitter:description', metadata.ogDescription || metadata.description);
      
      if (metadata.ogImage) {
        updateMetaTag('twitter:image', metadata.ogImage);
      }

      // Canonical URL
      if (metadata.canonicalUrl) {
        let canonicalTag = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
        if (!canonicalTag) {
          canonicalTag = document.createElement('link');
          canonicalTag.setAttribute('rel', 'canonical');
          document.head.appendChild(canonicalTag);
        }
        canonicalTag.setAttribute('href', metadata.canonicalUrl);
      }

      // Viewport meta tag
      let viewportTag = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
      if (!viewportTag) {
        viewportTag = document.createElement('meta');
        viewportTag.setAttribute('name', 'viewport');
        viewportTag.setAttribute('content', 'width=device-width, initial-scale=1, shrink-to-fit=no');
        document.head.appendChild(viewportTag);
      }
    }
  } catch (error) {
    console.warn('Failed to set SEO metadata:', error);
  }
};

export const landingPageSEO: SEOMetadata = {
  title: 'EduDash Pro - AI-Powered Educational Platform for Preschools',
  description: 'Revolutionary AI-powered educational platform transforming preschool learning. Create lessons, track progress, and engage parents with cutting-edge Society 5.0 technology.',
  keywords: [
    'education platform',
    'preschool management',
    'AI education',
    'educational technology',
    'teacher dashboard',
    'parent portal',
    'lesson planning',
    'student progress',
    'educational AI',
    'preschool software',
    'edtech',
    'learning management system'
  ],
  ogTitle: 'EduDash Pro - Transform Education with AI',
  ogDescription: 'Join thousands of educators using AI-powered tools for next-generation preschool learning. Create engaging lessons, track student progress, and connect with parents seamlessly.',
  twitterCard: 'summary_large_image'
};

export const pricingSEO: SEOMetadata = {
  title: 'EduDash Pro Pricing - Flexible Plans for Every Preschool',
  description: 'Affordable AI-powered education platform pricing. Start free with up to 50 students. Professional and Enterprise plans available. Transparent pricing, no hidden fees.',
  keywords: [
    'education pricing',
    'preschool software pricing',
    'edtech pricing',
    'educational platform cost',
    'school management pricing',
    'AI education cost',
    'free education platform',
    'preschool management cost'
  ],
  ogTitle: 'EduDash Pro Pricing - Start Free, Scale as You Grow',
  ogDescription: 'Transparent pricing for AI-powered school management. Free tier available. School plans from R399/month. Enterprise solutions for large organizations.',
  twitterCard: 'summary_large_image'
};