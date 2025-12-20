import { Tabs } from '../components/Tabs';
import { Accordion } from '../components/Accordion';
import { GlassCard } from '../components/GlassCard';
import './DocumentationPage.css';

function OverviewTab() {
  return (
    <div className="doc-tab-content">
      <section className="doc-section">
        <h3 className="doc-section-title">What Is This Protocol?</h3>
        <p>
          This protocol uses a reward-based token model where a small tax is applied to token transfers.
          The collected tax is used to distribute rewards to holders and to support long-term protocol operations.
        </p>
        <p>
          All rewards and treasury activity are handled automatically by the system and are publicly verifiable on-chain.
        </p>
      </section>

      <section className="doc-section">
        <h3 className="doc-section-title">How Value Flows</h3>
        <div className="flow-diagram">
          <div className="flow-box">
            <div className="flow-box-title">User Trades Token</div>
          </div>
          <div className="flow-arrow">↓</div>
          <div className="flow-box">
            <div className="flow-box-title">Transfer Tax Collected</div>
          </div>
          <div className="flow-arrow">↓</div>
          <div className="flow-box">
            <div className="flow-box-title">Rewards Vault + Treasury</div>
          </div>
          <div className="flow-arrow">↓</div>
          <div className="flow-box">
            <div className="flow-box-title">Distributions & Liquidity Support</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function RewardTokenTab() {
  return (
    <div className="doc-tab-content">
      <section className="doc-section">
        <h3 className="doc-section-title">Tax Structure</h3>
        <div className="tax-boxes">
          <div className="tax-box">
            <div className="tax-box-title">Total Tax</div>
            <div className="tax-box-value">4%</div>
            <div className="tax-box-text">Applied to token transfers</div>
          </div>
          <div className="tax-box">
            <div className="tax-box-title">Holder Rewards</div>
            <div className="tax-box-value">3%</div>
            <div className="tax-box-text">Used for reward distributions</div>
          </div>
          <div className="tax-box">
            <div className="tax-box-title">Treasury</div>
            <div className="tax-box-value">1%</div>
            <div className="tax-box-text">Supports protocol operations</div>
          </div>
        </div>
      </section>

      <section className="doc-section">
        <Accordion title="How the Tax Works">
          <p>
            The transfer tax is applied automatically by the token contract during transfers.
            Collected tax is routed directly into designated system vaults.
          </p>
          <p>
            No manual actions are required from users, and no new tokens are minted as part of this process.
          </p>
        </Accordion>
      </section>
    </div>
  );
}

function RewardsDistributionTab() {
  return (
    <div className="doc-tab-content">
      <section className="doc-section">
        <h3 className="doc-section-title">How Rewards Are Distributed</h3>
        <div className="steps-layout">
          <div className="step-item">
            <div className="step-number">1</div>
            <div className="step-content">
              <div className="step-title">Trading activity generates transfer tax</div>
            </div>
          </div>
          <div className="step-item">
            <div className="step-number">2</div>
            <div className="step-content">
              <div className="step-title">Tax accumulates over time</div>
            </div>
          </div>
          <div className="step-item">
            <div className="step-number">3</div>
            <div className="step-content">
              <div className="step-title">Rewards are harvested by the system</div>
            </div>
          </div>
          <div className="step-item">
            <div className="step-number">4</div>
            <div className="step-content">
              <div className="step-title">SOL is distributed to eligible holders</div>
            </div>
          </div>
          <div className="step-item">
            <div className="step-number">5</div>
            <div className="step-content">
              <div className="step-title">A reward epoch is completed</div>
            </div>
          </div>
        </div>
      </section>

      <section className="doc-section">
        <Accordion title="Reward Epochs">
          <p>
            Rewards are distributed in grouped batches called reward epochs.
            Each epoch has a clear status and is recorded on-chain for verification.
          </p>
          <p>
            This approach improves efficiency and reduces unnecessary network transactions.
          </p>
        </Accordion>
      </section>

      <section className="doc-section">
        <Accordion title="Why Rewards Are Not Instant">
          <p>
            Distributions are processed in intervals to reduce network costs and improve reliability.
            This helps ensure rewards are delivered accurately and consistently.
          </p>
        </Accordion>
      </section>
    </div>
  );
}

function TreasuryTab() {
  return (
    <div className="doc-tab-content">
      <section className="doc-section">
        <h3 className="doc-section-title">What Is the Treasury?</h3>
        <p>
          The treasury receives a portion of the transfer tax and is used to support protocol operations.
          Treasury funds help maintain liquidity, stability, and long-term sustainability.
        </p>
      </section>

      <section className="doc-section">
        <Accordion title="How Treasury Funds Are Used">
          <p>
            Treasury funds may be used to support liquidity pools, manage operational needs, and prepare future deployments.
          </p>
          <p>
            Treasury actions are executed transparently and are recorded on-chain.
          </p>
        </Accordion>
      </section>

      <section className="doc-section">
        <div className="highlight-box">
          <p>
            <strong>Transparency Note:</strong> All treasury activity is publicly visible and verifiable through on-chain transactions.
          </p>
        </div>
      </section>
    </div>
  );
}

function LiquidityPoolsTab() {
  return (
    <div className="doc-tab-content">
      <section className="doc-section">
        <h3 className="doc-section-title">What Are Liquidity Pools?</h3>
        <p>
          Liquidity pools allow users to trade tokens efficiently.
          These pools generate fees from trading activity, which support the broader ecosystem.
        </p>
      </section>

      <section className="doc-section">
        <Accordion title="Why Multiple Liquidity Pools Exist">
          <p>
            Multiple pools improve trading efficiency and reduce dependency on a single market.
            This approach helps distribute liquidity and supports long-term protocol health.
          </p>
        </Accordion>
      </section>

      <section className="doc-section">
        <h3 className="doc-section-title">Liquidity Pool Ecosystem</h3>
        <div className="pool-diagram">
          <div className="pool-center">Token</div>
          <div className="pool-connections">
            <div className="pool-arrow">↳</div>
            <div className="pool-item">Token / SOL Pool</div>
          </div>
          <div className="pool-connections">
            <div className="pool-arrow">↳</div>
            <div className="pool-item">Token / USDC Pool</div>
          </div>
          <div className="pool-connections">
            <div className="pool-arrow">↳</div>
            <div className="pool-item">Token / Other Assets</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FAQTab() {
  return (
    <div className="doc-tab-content">
      <section className="doc-section">
        <Accordion title="How often are rewards distributed?">
          <p>
            Rewards are distributed during reward epochs, which occur based on system conditions and activity.
          </p>
        </Accordion>

        <Accordion title="Where can I verify distributions?">
          <p>
            All reward distributions are publicly recorded and can be verified through on-chain explorers.
          </p>
        </Accordion>

        <Accordion title="What happens if a distribution fails?">
          <p>
            Failed epochs are recorded transparently and do not result in lost funds.
          </p>
        </Accordion>

        <Accordion title="Is the treasury wallet public?">
          <p>
            Yes. Treasury activity is publicly verifiable on-chain.
          </p>
        </Accordion>

        <Accordion title="Do rewards depend on holding duration?">
          <p>
            Rewards are based on eligibility during distribution epochs, not promises or fixed timelines.
          </p>
        </Accordion>
      </section>
    </div>
  );
}

export function DocumentationPage() {
  const tabs = [
    { id: 'overview', label: 'Overview', content: <OverviewTab /> },
    { id: 'reward-token', label: 'Reward Token & Tax', content: <RewardTokenTab /> },
    { id: 'rewards-distribution', label: 'Rewards Distribution', content: <RewardsDistributionTab /> },
    { id: 'treasury', label: 'Treasury', content: <TreasuryTab /> },
    { id: 'liquidity-pools', label: 'Liquidity Pools', content: <LiquidityPoolsTab /> },
    { id: 'faq', label: 'Common Questions', content: <FAQTab /> },
  ];

  return (
    <div className="documentation-page">
      <section className="dashboard-section">
        <GlassCard className="dashboard-section-card">
          <h2 className="section-title">Documentation</h2>
          <p className="section-subtitle">Learn how rewards, treasury, and protocol mechanics work.</p>
          
          <Tabs tabs={tabs} defaultTab="overview" />
        </GlassCard>
      </section>
    </div>
  );
}

