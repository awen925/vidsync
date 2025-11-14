import React, { useState } from 'react';
import { CreditCard, Check, Zap, Archive, Download, ChevronRight } from 'lucide-react';

type PlanType = 'free' | 'pro' | 'enterprise';

interface Plan {
  id: PlanType;
  name: string;
  price: string;
  description: string;
  storage: string;
  bandwidth: string;
  features: string[];
  color: string;
  badge?: string;
}

const SubscriptionPage: React.FC = () => {
  const [currentPlan, setCurrentPlan] = useState<PlanType>('pro');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const plans: Plan[] = [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      description: 'Get started for free',
      storage: '5 GB',
      bandwidth: '1 GB/month',
      features: [
        'Basic file sync',
        'Up to 3 projects',
        'Email support',
        '30-day file history',
        'Basic sharing',
      ],
      color: 'gray',
    },
    {
      id: 'pro',
      name: 'Pro',
      price: billingCycle === 'monthly' ? '$9.99' : '$99.99',
      description: 'For active creators',
      storage: '500 GB',
      bandwidth: '50 GB/month',
      features: [
        'Advanced file sync',
        'Unlimited projects',
        'Priority support',
        '2-year file history',
        'Advanced sharing & permissions',
        'Team collaboration',
        'API access',
      ],
      color: 'blue',
      badge: 'CURRENT',
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 'Custom',
      description: 'For large teams',
      storage: 'Unlimited',
      bandwidth: 'Unlimited',
      features: [
        'Everything in Pro',
        'Dedicated support',
        'Custom features',
        'SSO & security controls',
        'Advanced audit logs',
        'SLA guarantee',
        'Custom integrations',
      ],
      color: 'purple',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 ml-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white">
        <div className="max-w-6xl mx-auto px-8 py-12">
          <div className="flex items-center gap-3">
            <CreditCard size={32} />
            <h1 className="text-4xl font-bold">Subscription & Billing</h1>
          </div>
          <p className="text-blue-100 mt-2">Manage your plan and billing settings</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-8 py-8">
        {/* Current Plan & Billing */}
        <div className="grid grid-cols-2 gap-6 mb-12">
          {/* Current Plan */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Current Plan</h3>
            <div className="mb-6">
              <p className="text-sm text-gray-600">Active Plan</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">Pro</p>
              <p className="text-gray-600 mt-2">Renews on December 15, 2024</p>
            </div>
            <button className="w-full px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-900 font-medium transition-colors">
              Change Plan
            </button>
          </div>

          {/* Billing Method */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Billing Method</h3>
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <CreditCard className="text-gray-600" size={24} />
                <div>
                  <p className="font-medium text-gray-900">Visa Card</p>
                  <p className="text-sm text-gray-600">•••• •••• •••• 4242</p>
                </div>
              </div>
              <p className="text-sm text-gray-600">Expires 12/25</p>
            </div>
            <button className="w-full px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-900 font-medium transition-colors">
              Update Payment Method
            </button>
          </div>
        </div>

        {/* Billing Cycle Toggle */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <span className={`font-medium ${billingCycle === 'monthly' ? 'text-gray-900' : 'text-gray-600'}`}>
            Monthly
          </span>
          <button
            onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
            className="relative inline-flex h-8 w-14 items-center rounded-full bg-gray-300 transition-colors"
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                billingCycle === 'yearly' ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
          <span className={`font-medium ${billingCycle === 'yearly' ? 'text-gray-900' : 'text-gray-600'}`}>
            Yearly
          </span>
          {billingCycle === 'yearly' && (
            <div className="ml-4 px-3 py-1 bg-green-100 rounded-full">
              <p className="text-sm font-medium text-green-800">Save 16%</p>
            </div>
          )}
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-3 gap-8 mb-12">
          {plans.map(plan => (
            <div
              key={plan.id}
              className={`relative rounded-lg border-2 transition-all overflow-hidden ${
                currentPlan === plan.id
                  ? `border-blue-600 shadow-lg shadow-blue-200 bg-gradient-to-br from-blue-50 to-white`
                  : 'border-gray-200 bg-white hover:shadow-lg'
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="absolute top-0 right-0 bg-blue-600 text-white px-4 py-1 text-xs font-bold rounded-bl-lg">
                  {plan.badge}
                </div>
              )}

              <div className="p-6 h-full flex flex-col">
                {/* Plan Header */}
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-1">{plan.name}</h3>
                  <p className="text-sm text-gray-600 mb-4">{plan.description}</p>
                  <div className="mb-4">
                    <p className="text-4xl font-bold text-gray-900">{plan.price}</p>
                    {plan.id !== 'enterprise' && (
                      <p className="text-sm text-gray-600 mt-1">
                        {billingCycle === 'monthly' ? 'per month' : 'per year'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Resources */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Archive size={16} className="text-blue-600" />
                    <span className="text-sm text-gray-600">{plan.storage} storage</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap size={16} className="text-blue-600" />
                    <span className="text-sm text-gray-600">{plan.bandwidth} bandwidth</span>
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-3 mb-6 flex-1">
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <Check className="text-green-500 flex-shrink-0 mt-0.5" size={18} />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Action Button */}
                <button
                  onClick={() => setCurrentPlan(plan.id)}
                  className={`w-full py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                    currentPlan === plan.id
                      ? `bg-blue-600 text-white hover:bg-blue-700`
                      : `bg-gray-100 text-gray-900 hover:bg-gray-200`
                  }`}
                >
                  {currentPlan === plan.id ? 'Current Plan' : plan.id === 'enterprise' ? 'Contact Sales' : 'Upgrade'}
                  {currentPlan !== plan.id && <ChevronRight size={18} />}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Billing History */}
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Billing History</h3>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Description</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Amount</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    date: 'November 15, 2024',
                    description: 'Pro Plan - Monthly',
                    amount: '$9.99',
                    status: 'Paid',
                  },
                  {
                    date: 'October 15, 2024',
                    description: 'Pro Plan - Monthly',
                    amount: '$9.99',
                    status: 'Paid',
                  },
                  {
                    date: 'September 15, 2024',
                    description: 'Pro Plan - Monthly',
                    amount: '$9.99',
                    status: 'Paid',
                  },
                  {
                    date: 'August 15, 2024',
                    description: 'Pro Plan - Monthly',
                    amount: '$9.99',
                    status: 'Paid',
                  },
                  {
                    date: 'July 15, 2024',
                    description: 'Pro Plan - Monthly',
                    amount: '$9.99',
                    status: 'Paid',
                  },
                ].map((transaction, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-4 text-gray-900">{transaction.date}</td>
                    <td className="px-4 py-4 text-gray-900">{transaction.description}</td>
                    <td className="px-4 py-4 text-gray-900 font-medium">{transaction.amount}</td>
                    <td className="px-4 py-4">
                      <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                        {transaction.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <button className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium">
                        <Download size={16} />
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-12 bg-white rounded-lg border border-gray-200 p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h3>

          <div className="space-y-4">
            {[
              {
                question: 'Can I change my plan anytime?',
                answer: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the end of your current billing cycle.',
              },
              {
                question: 'What payment methods do you accept?',
                answer: 'We accept all major credit cards (Visa, MasterCard, American Express) and digital payment methods.',
              },
              {
                question: 'Do you offer refunds?',
                answer: 'We offer a 30-day money-back guarantee on new subscriptions. Contact support for more details.',
              },
              {
                question: 'What happens if I exceed my bandwidth limit?',
                answer: 'We\'ll notify you when you\'re approaching your limit. If you exceed it, you can upgrade your plan or purchase additional bandwidth.',
              },
            ].map((faq, idx) => (
              <div key={idx} className="border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                <p className="font-semibold text-gray-900 mb-2">{faq.question}</p>
                <p className="text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Support */}
        <div className="mt-8 text-center">
          <p className="text-gray-600 mb-4">Need help with your subscription?</p>
          <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
            Contact Support
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPage;
