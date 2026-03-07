'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-800 border-t border-gray-700 mt-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* About */}
          <div>
            <h3 className="text-white font-semibold mb-4">Young Eagles</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Empowering South African preschools with AI-powered educational tools.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/"
                  className="text-gray-400 hover:text-white text-sm transition-colors"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-gray-400 hover:text-white text-sm transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-gray-400 hover:text-white text-sm transition-colors"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  href="/popia"
                  className="text-gray-400 hover:text-white text-sm transition-colors"
                >
                  POPIA Compliance
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-white font-semibold mb-4">Support</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="mailto:support@edudash.pro"
                  className="text-gray-400 hover:text-white text-sm transition-colors"
                >
                  support@edudash.pro
                </a>
              </li>
              <li>
                <span className="text-gray-400 text-sm">Mon-Fri: 8am - 5pm SAST</span>
              </li>
            </ul>
          </div>

          {/* App */}
          <div>
            <h3 className="text-white font-semibold mb-4">Get the App</h3>
            <p className="text-gray-400 text-sm mb-3">
              Download our mobile app for the best experience
            </p>
            <a
              href={process.env.NEXT_PUBLIC_PLAY_STORE_URL || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              📱 Get on Play Store
            </a>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-700 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-400 text-sm text-center md:text-left">
            © {currentYear} Young Eagles. All rights reserved.
          </p>
          <p className="text-gray-400 text-sm flex items-center gap-1">
            Made with <Heart className="w-4 h-4 text-red-500 fill-current" /> in South Africa 🇿🇦
          </p>
        </div>
      </div>
    </footer>
  );
}
