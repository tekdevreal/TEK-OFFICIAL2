import { Tabs } from '../components/Tabs';
import { Accordion } from '../components/Accordion';
import { GlassCard } from '../components/GlassCard';
import './DocumentationPage.css';
import './DocumentationPage-responsive.css';

function OverviewTab() {
  return (
    <div className="doc-tab-content">
      <section className="doc-section">
        <h3 className="doc-section-title">What Is NUKE?</h3>
        <p>
          NUKE is a Solana-based token protocol designed to provide automatic SOL yield to holders through a self-sustaining system powered by engineered arbitrage volume and Tax Reward mechanism. Unlike traditional tokens that rely solely on hype or organic trading, NUKE leverages a multi-pool architecture to create perpetual, mechanics-driven baseline activity. This ensures consistent rewards even during periods of low market interest.
        </p>
        <p>
          At its core, the protocol operates as a "hold-to-earn" model where every trade generates value that flows back to holders. Here's how value flows through the ecosystem:
        </p>
        
        <div className="doc-subsection">
          <h4 className="doc-subsection-title">Trade Initiation</h4>
          <p>
            Any buy, sell, or transfer of NUKE triggers a 3% transfer tax, which is automatically collected on-chain.
          </p>
        </div>

        <div className="doc-subsection">
          <h4 className="doc-subsection-title">Tax Allocation</h4>
          <p>
            The tax is split to fuel rewards, liquidity growth, and deflation. Specifically, 2% is converted to SOL and distributed as passive yield to all holders, while 1% goes to a treasury for compounding liquidity and strategic marketing.
          </p>
        </div>

        <div className="doc-subsection">
          <h4 className="doc-subsection-title">Arbitrage-Driven Volume</h4>
          <p>
            NUKE's fragmented liquidity pools (with varying fee structures from 0.01% to 2%) attract arbitrage bots that exploit price discrepancies across pools. This generates reliable baseline trading volume without depending on external hype.
          </p>
        </div>

        <div className="doc-subsection">
          <h4 className="doc-subsection-title">Liquidity Flywheel</h4>
          <p>
            Treasury funds are reinvested to deepen liquidity pools, which in turn attracts more bot activity and volume. This creates a compounding loop: deeper pools → more arbitrage → higher volume → greater tax collection → amplified rewards.
          </p>
        </div>

        <div className="doc-subsection">
          <h4 className="doc-subsection-title">Deflation and Yield Amplification</h4>
          <p>
            A portion of collected taxes (1% per cycle) is burned, reducing supply over time and increasing each holder's proportional share of future yields.
          </p>
        </div>

        <div className="doc-subsection">
          <h4 className="doc-subsection-title">Holder Benefits</h4>
          <p>
            Value ultimately flows to holders as automatic SOL airdrops, price stabilization from fragmented liquidity, and long-term scarcity from burns—all backed by the protocol's engineered sustainability.
          </p>
        </div>

        <p className="doc-highlight">
          This architecture ensures that value isn't extracted but recycled: arbitrage profits are effectively funneled back into the system, creating a net-positive ecosystem where holding NUKE passively earns SOL through mechanical reliability.
        </p>
      </section>

      <section className="doc-section">
        <h3 className="doc-section-title">How Value Flows</h3>
        <div className="flow-diagram">
          <div className="flow-box">
            <div className="flow-box-title">User Trades Token</div>
            <div className="flow-box-description">3% transfer tax collected automatically</div>
          </div>
          <div className="flow-arrow">↓</div>
          <div className="flow-box">
            <div className="flow-box-title">Transfer Tax Collected</div>
            <div className="flow-box-description">Split: 2% for rewards, 1% for treasury</div>
          </div>
          <div className="flow-arrow">↓</div>
          <div className="flow-box">
            <div className="flow-box-title">Arbitrage-Driven Volume</div>
            <div className="flow-box-description">Multi-pool architecture attracts bot activity</div>
          </div>
          <div className="flow-arrow">↓</div>
          <div className="flow-box">
            <div className="flow-box-title">Rewards Holders + Treasury</div>
            <div className="flow-box-description">Automatic SOL distributions + liquidity support</div>
          </div>
          <div className="flow-arrow">↓</div>
          <div className="flow-box">
            <div className="flow-box-title">Distributions & Liquidity Support</div>
            <div className="flow-box-description">Compounding flywheel effect</div>
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
        <h3 className="doc-section-title">NUKE Token Overview</h3>
        <p>
          The NUKE token is engineered as a reward-focused asset on Solana, with a total supply of 1 Billion NUKE. Mint authority is revoked, preventing any additional issuance, and liquidity provider (LP) tokens are fully burned at launch for irreversible, rug-proof liquidity.
        </p>
      </section>

      <section className="doc-section">
        <h3 className="doc-section-title">Tax Structure</h3>
        <div className="tax-boxes">
          <div className="tax-box">
            <div className="tax-box-title">Total Tax</div>
            <div className="tax-box-value">3%</div>
            <div className="tax-box-text">Applied to token transfers</div>
          </div>
          <div className="tax-box">
            <div className="tax-box-title">Holder Rewards</div>
            <div className="tax-box-value">2%</div>
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
            The core mechanic revolves around a uniform 3% transfer tax applied to every buy, sell, or transfer. No exceptions for fairness across all participants. This tax is automatically enforced on-chain and breaks down as follows:
          </p>
          
          <div className="tax-breakdown">
            <div className="tax-breakdown-item">
              <h4 className="tax-breakdown-title">2% for SOL Reflections</h4>
              <p>
                This portion is swapped to SOL approximately every 10 minutes (via automated processes) and distributed as direct yield to holders. It's a gas-efficient, pro-rata system where rewards scale with your holdings— no staking or active claiming required.
              </p>
            </div>

            <div className="tax-breakdown-item">
              <h4 className="tax-breakdown-title">1% for Treasury</h4>
              <p>
                Allocated exclusively to liquidity compounding and marketing initiatives. This ensures the protocol's growth without any founder or team extraction, maintaining trust and sustainability.
              </p>
            </div>

            <div className="tax-breakdown-item">
              <h4 className="tax-breakdown-title">Deflationary Element</h4>
              <p>
                Additionally, the protocol includes a deflationary element: 1% of the collected tax tokens is reinvested to deepen liquidity pools and burned. This reduces the overall supply over time, concentrating value among remaining holders and enhancing long-term yield potential.
              </p>
            </div>
          </div>

          <p className="tax-summary">
            The tax structure is designed for simplicity and efficiency, uniform across all transactions to avoid complexity while maximizing holder benefits. By tying taxes directly to volume (boosted by arbitrage), NUKE creates a self-reinforcing reward token where increased activity translates to higher SOL yields, all while the treasury builds deeper, more resilient liquidity.
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
        <p>
          Rewards in the NUKE protocol are distributed automatically and passively, ensuring holders earn SOL without any manual intervention. The process is powered by the 2% reflections portion of the 3% transfer tax, which accumulates from every trade and is converted to SOL for fair, pro-rata airdrops.
        </p>
        <p>
          Here's a step-by-step breakdown of how rewards are distributed:
        </p>

        <div className="steps-layout">
          <div className="step-item">
            <div className="step-number">1</div>
            <div className="step-content">
              <div className="step-title">Tax Collection</div>
              <div className="step-description">
                On every NUKE transfer, 2% of the transaction amount (in NUKE tokens) is collected into a reward pool.
              </div>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">2</div>
            <div className="step-content">
              <div className="step-title">Automated Swapping</div>
              <div className="step-description">
                Approximately every 5 minutes, the accumulated NUKE in the reward pool is swapped to SOL through efficient on-chain mechanisms (e.g., via integrated DEX routes). This timing balances gas costs with timely distributions.
              </div>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">3</div>
            <div className="step-content">
              <div className="step-title">Pro-Rata Airdrops</div>
              <div className="step-description">
                The resulting SOL is airdropped directly to all NUKE holders based on their proportional ownership of the total circulating supply. For example, if you hold 1% of all NUKE, you'll receive 1% of the SOL rewards from each cycle—scaling seamlessly as the protocol grows.
              </div>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">4</div>
            <div className="step-content">
              <div className="step-title">Baseline Assurance</div>
              <div className="step-description">
                Even in low-organic trading periods, the multi-pool arbitrage design generates minimum volume, ensuring a steady flow of taxes and thus consistent reward distributions. This "engineered baseline" prevents rewards from drying up.
              </div>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">5</div>
            <div className="step-content">
              <div className="step-title">Compounding Effects</div>
              <div className="step-description">
                As treasury funds deepen liquidity and burns reduce supply, per-holder rewards amplify over time. Holders benefit from both immediate SOL drips and long-term value concentration.
              </div>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">6</div>
            <div className="step-content">
              <div className="step-title">Transparency and Security</div>
              <div className="step-description">
                All distributions are trackable on-chain, with no central control, contract ownership is renounced, and processes are fully automated for trustless operation.
              </div>
            </div>
          </div>
        </div>

        <p className="doc-highlight">
          This distribution method is gas-optimized for scalability, making it suitable for high-volume scenarios while keeping rewards predictable and holder-centric.
        </p>
      </section>

      <section className="doc-section">
        <Accordion title="Epoch and Cycles">
          <p>
            The NUKE protocol operates on a time-based system of epochs and cycles to organize and track reward distributions efficiently.
          </p>
          
          <div className="epoch-explanation">
            <div className="epoch-item">
              <h4 className="epoch-item-title">What is an Epoch?</h4>
              <p>
                An epoch represents one full day (24 hours) in UTC time. Each epoch starts at 00:00 UTC and ends at 23:59 UTC. Epochs are numbered sequentially (Epoch 1, Epoch 2, etc.) and provide a clear timeframe for tracking protocol activity and distributions.
              </p>
            </div>

            <div className="epoch-item">
              <h4 className="epoch-item-title">What are Cycles?</h4>
              <p>
                Within each epoch, there are 288 cycles. Each cycle lasts exactly 5 minutes (24 hours ÷ 5 minutes = 288 cycles). During each cycle, the protocol collects taxes, swaps NUKE to SOL, and distributes rewards to holders.
              </p>
            </div>

            <div className="epoch-item">
              <h4 className="epoch-item-title">How They Work Together</h4>
              <p>
                <strong>Cycle Execution:</strong> Every 5 minutes, a new cycle begins. The system checks if there's enough tax collected (minimum $5), swaps NUKE to SOL, and distributes rewards proportionally to all eligible holders.
              </p>
              <p>
                <strong>Epoch Reset:</strong> At 00:00 UTC each day, the cycle counter resets to 1, and a new epoch begins. This allows for clear daily tracking of distributions and protocol performance.
              </p>
              <p>
                <strong>Example:</strong> If you check the dashboard at 14:35 UTC on Day 2, you would see "Epoch: 2, Cycle: 175 / 288" - meaning it's the second day since launch, and 175 cycles (approximately 14.5 hours) have passed in the current epoch.
              </p>
            </div>
          </div>
        </Accordion>
      </section>

      <section className="doc-section">
        <Accordion title="The Reward System">
          <p>
            The NUKE reward system is designed for efficiency, sustainability, and fairness. It incorporates several mechanisms to optimize gas costs, prevent manipulation, and ensure smooth operations even during high-volume periods.
          </p>

          <div className="reward-system-breakdown">
            <div className="reward-system-item">
              <h4 className="reward-system-title">1️⃣ Minimum Tax Collected Before Harvesting</h4>
              <p>
                <strong>Prevents inefficient micro-harvests and rolls over automatically</strong>
              </p>
              <p>
                The protocol requires a minimum of <strong>$5 worth of tax collected</strong> before proceeding with swapping and distribution. This prevents wasting gas fees on tiny distributions that would cost more to process than their value.
              </p>
              <p>
                If a cycle ends with less than $5 collected, the tax automatically rolls over to the next cycle, accumulating until the threshold is met. This ensures every distribution is cost-effective and meaningful for holders.
              </p>
            </div>

            <div className="reward-system-item">
              <h4 className="reward-system-title">2️⃣ Harvesting With Max Limit + Time-Splitting</h4>
              <p>
                <strong>Handles high-volume days safely + Smooth sell pressure</strong>
              </p>
              <p>
                When tax collection exceeds <strong>$2,000</strong>, the harvesting process automatically splits the distribution into <strong>4 equal batches</strong>. This prevents large single swaps that could cause significant price impact or destabilize liquidity pools.
              </p>
              <p>
                Each batch is processed sequentially across multiple cycles, spreading out sell pressure and maintaining price stability. This ensures smooth operations even during viral trading days with extremely high volume.
              </p>
            </div>

            <div className="reward-system-item">
              <h4 className="reward-system-title">3️⃣ Accumulate Small Rewards to Reduce Fees</h4>
              <p>
                <strong>All rewards are tracked per holder</strong>
              </p>
              <p>
                To minimize gas costs for small holders, the protocol only executes payouts when a holder's accumulated rewards reach <strong>$1 or more</strong>. If your rewards are below $1, they continue accumulating in your tracked balance until the threshold is met.
              </p>
              <p>
                This system ensures that every holder eventually receives their full rewards without wasting gas on numerous micro-transactions. Your rewards are never lost—they're simply batched efficiently for optimal cost savings.
              </p>
            </div>
          </div>

          <p className="reward-system-summary">
            These mechanisms work together to create a sustainable, gas-efficient reward system that scales from low-volume periods to viral growth, all while maximizing the value delivered to holders.
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
          The Treasury in the NUKE protocol serves as a decentralized, on-chain fund that collects and manages a portion of the transaction taxes to ensure the long-term sustainability, growth, and resilience of the ecosystem. It acts as a strategic reserve, automatically funded by <strong>1% of every 3% transfer tax</strong> applied to buys, sells, and transfers of NUKE tokens. This Treasury is not controlled by any central entity—<strong>contract ownership is fully renounced at launch</strong>, making all operations trustless and transparent via Solana's blockchain.
        </p>
        <p>
          Unlike traditional token treasuries that might be subject to manual withdrawals or team discretion, NUKE's Treasury is programmatically designed for efficiency and holder alignment. It accumulates NUKE tokens from taxes, which are then converted and deployed through automated or community-governed mechanisms. The primary goal is to create a self-reinforcing flywheel: by reinvesting funds into liquidity and marketing, the Treasury boosts trading volume, which in turn generates more taxes and rewards for holders.
        </p>

        <div className="treasury-features">
          <h4 className="treasury-features-title">Key Features of the Treasury:</h4>
          <div className="treasury-feature-item">
            <div className="treasury-feature-icon">🔒</div>
            <div className="treasury-feature-content">
              <h5>Automation and Security</h5>
              <p>Funds are held in a smart contract with no mint authority or upgradeable components, preventing rugs or unauthorized access.</p>
            </div>
          </div>

          <div className="treasury-feature-item">
            <div className="treasury-feature-icon">🔍</div>
            <div className="treasury-feature-content">
              <h5>Transparency</h5>
              <p>All inflows, conversions, and deployments are verifiable on-chain using Solana explorers like Solscan or Explorer.solana.com.</p>
            </div>
          </div>

          <div className="treasury-feature-item">
            <div className="treasury-feature-icon">♻️</div>
            <div className="treasury-feature-content">
              <h5>Sustainability Focus</h5>
              <p>The Treasury prioritizes actions that enhance the protocol's baseline activity, such as arbitrage-driven volume, without relying on short-term hype.</p>
            </div>
          </div>

          <div className="treasury-feature-item">
            <div className="treasury-feature-icon">🚫</div>
            <div className="treasury-feature-content">
              <h5>No Team Extraction</h5>
              <p>There are no allocations for founders, developers, or teams—100% of Treasury funds are used for ecosystem benefits.</p>
            </div>
          </div>
        </div>

        <p className="doc-highlight">
          In essence, the Treasury transforms a small slice of transaction fees into compounding value, ensuring NUKE remains a robust "hold-to-earn" token even in varying market conditions.
        </p>
      </section>

      <section className="doc-section">
        <Accordion title="How Are Treasury Funds Used?">
          <p>
            Treasury funds are exclusively dedicated to two core pillars: <strong>liquidity compounding</strong> and <strong>strategic marketing</strong>. This allocation is hardcoded into the protocol, with no flexibility for other uses, to maintain focus and trust. The 1% tax portion (in NUKE tokens) accumulates in the Treasury contract and is periodically converted to SOL or other assets for deployment. Conversions and usages occur through automated scripts or, in some cases, community-voted proposals via integrated governance tools (if enabled post-launch).
          </p>

          <div className="treasury-usage-section">
            <h4 className="treasury-usage-title">Liquidity Compounding (Primary Allocation: 100% of Treasury Funds)</h4>
            
            <div className="treasury-usage-content">
              <p><strong>Purpose:</strong> To deepen and fragment liquidity pools across multiple DEXes on Solana, enhancing price stability and attracting more arbitrage bots.</p>
              
              <p><strong>Mechanism:</strong></p>
              <ul>
                <li>Accumulated NUKE tokens are swapped to SOL (or paired assets) via low-fee routes.</li>
                <li>SOL is then added to existing liquidity pools, with a focus on creating or expanding fragmented pools (e.g., with varying fee tiers from 0.01% to 2%).</li>
                <li>This creates a "liquidity flywheel": Deeper pools lead to tighter spreads, more bot activity, higher trading volume, increased tax collection, and ultimately amplified SOL rewards for holders.</li>
              </ul>

              <p><strong>Benefits:</strong></p>
              <ul>
                <li>Reduces slippage for traders, making NUKE more attractive for large-volume trades.</li>
                <li>Mitigates volatility by distributing liquidity, preventing single-pool dominance.</li>
                <li>Ensures baseline volume persists, as arbitrage opportunities arise from pool discrepancies.</li>
              </ul>

              <p><strong>Frequency:</strong> Automated additions occur every 24-48 hours or when Treasury balances reach a threshold (e.g., equivalent to 1,000 SOL), to optimize gas costs.</p>

              <div className="treasury-example-box">
                <strong>Example:</strong> If the Treasury collects 10,000 NUKE from taxes, it might convert them to ~5 SOL (depending on market price) and add it to a low-fee pool, increasing total liquidity by 1-2%.
              </div>
            </div>
          </div>
        </Accordion>
      </section>

      <section className="doc-section">
        <Accordion title="Future Plans for the Treasury">
          <p>
            As the NUKE protocol matures, the Treasury will evolve to incorporate advanced mechanisms that further enhance holder value, sustainability, and ecosystem growth. Currently, <strong>100% of the 1% Treasury tax allocation is directed toward liquidity compounding</strong> to build a strong foundational base of depth and arbitrage-driven volume. In future phases, this allocation will be diversified through community-governed updates to the smart contract (e.g., via DAO proposals on Solana). These updates will introduce <strong>deflationary burns with integrated buybacks</strong> and a <strong>dedicated marketing budget</strong>, all while maintaining the protocol's trustless and automated nature.
          </p>
          <p>
            The planned diversification aims to balance immediate liquidity strength with long-term scarcity and visibility, creating even greater compounding effects for SOL rewards. All changes will be transparent, audited, and implemented only after holder consensus to ensure alignment with the "hold-to-earn" ethos.
          </p>

          <div className="future-plans-breakdown">
            <div className="future-plan-item">
              <h4 className="future-plan-title">Liquidity Compounding (Primary Allocation: ~60-70% of Treasury Funds)</h4>
              
              <p><strong>Continuation and Refinement:</strong> Building on the current 100% focus, liquidity compounding will remain the cornerstone, with funds used to deepen fragmented pools and optimize fee structures for maximum arbitrage attraction.</p>
              
              <p><strong>Evolution:</strong> Future enhancements may include automated pool migrations to emerging Solana DEXes or integrations with yield-bearing liquidity (e.g., via lending protocols) to amplify baseline volume without increasing risk.</p>
            </div>

            <div className="future-plan-item">
              <h4 className="future-plan-title">Deflationary Burns with Buybacks (New Allocation: ~10-20% of Treasury Funds)</h4>
              
              <p><strong>Mechanism:</strong> A portion of accumulated Treasury NUKE tokens will be periodically bought back from the market using converted SOL and then permanently burned. This process will occur through on-chain automation, such as timed swaps and burns every 7-14 days or when Treasury thresholds are met (e.g., equivalent to 500 SOL).</p>
              
              <p><strong>Buyback Process:</strong> Treasury SOL is used to purchase NUKE tokens via low-slippage DEX routes, ensuring efficient execution without market disruption.</p>
              
              <p><strong>Burn Execution:</strong> Bought-back NUKE is sent to a dead address (e.g., the Solana burn address), irreversibly removing it from circulation. This builds on the existing 1% per-cycle burn but scales it with Treasury resources for accelerated supply reduction.</p>

              <div className="benefits-section">
                <h5>Benefits:</h5>
                <ul>
                  <li><strong>Supply Reduction and Scarcity:</strong> By systematically decreasing the total NUKE supply (starting from 1,000,000,000 with mint authority revoked), each remaining token becomes more valuable over time. Holders' proportional ownership increases, amplifying their share of future SOL rewards and potential price appreciation.</li>
                  <li><strong>Price Support and Stability:</strong> Buybacks provide organic buying pressure, helping to stabilize or uplift the NUKE price during market dips. This counteracts sell-offs and reinforces the protocol's resilience, as arbitrage bots respond to improved liquidity dynamics.</li>
                  <li><strong>Compounding Rewards:</strong> Reduced supply means higher per-holder yields from the 2% reflections tax, creating a deflationary flywheel: fewer tokens → greater individual stake → more SOL per holder → increased holding incentive.</li>
                  <li><strong>Anti-Inflationary Hedge:</strong> In a volatile crypto market, burns protect against dilution, making NUKE a more attractive long-term asset compared to inflationary tokens.</li>
                  <li><strong>Holder-Centric Value:</strong> Unlike manual team burns, this automated system ensures fair, predictable deflation, fostering trust and encouraging longer hold periods for sustained volume.</li>
                </ul>
              </div>

              <p className="implementation-note"><strong>Implementation Timeline:</strong> Targeted for Phase 2 (post-mainnet stability, approximately 6-12 months after launch), with initial burn rates starting at 10% of Treasury and adjustable via governance.</p>
            </div>

            <div className="future-plan-item">
              <h4 className="future-plan-title">Strategic Marketing (Secondary Allocation: ~20-30% of Treasury Funds)</h4>
              
              <p><strong>Purpose:</strong> To drive organic adoption and educate the broader Solana community about NUKE's unique arbitrage-powered yield model, without relying on paid promotions or hype.</p>
              
              <p><strong>Mechanism:</strong> Funds will support initiatives like collaborations with DeFi influencers, sponsored content on platforms such as X (formerly Twitter) or Discord, and integrations with Solana wallets or analytics tools. All spends will be proposed and voted on by holders through a lightweight DAO (e.g., using Realms on Solana), with strict caps per campaign to prevent overuse.</p>
              
              <p><strong>Examples:</strong> Funding AMAs with Solana builders, creating tutorial videos on the multi-pool system, or offering bounties for community-developed tools (e.g., reward trackers).</p>

              <div className="benefits-section">
                <h5>Benefits:</h5>
                <ul>
                  <li><strong>Increased Visibility and Adoption:</strong> Targeted marketing attracts informed holders and traders, boosting organic volume and thus tax generation for rewards.</li>
                  <li><strong>Sustainable Growth:</strong> By focusing on education over speculation, it builds a resilient community, reducing churn and enhancing the protocol's reputation in the Solana ecosystem.</li>
                  <li><strong>Synergy with Other Allocations:</strong> Higher adoption amplifies liquidity compounding and buyback impacts, creating a holistic growth loop.</li>
                </ul>
              </div>

              <p className="implementation-note"><strong>Implementation Timeline:</strong> Rolled out in Phase 1.5 (3-6 months post-launch), once liquidity reaches critical mass, to maximize ROI on marketing efforts.</p>
            </div>

            <div className="future-plan-item">
              <h4 className="future-plan-title">Governance and Safeguards</h4>
              
              <ul>
                <li><strong>Community-Driven Evolution:</strong> All future changes require at least 60% holder approval via on-chain voting, with proposals locked to predefined parameters (e.g., no team extractions).</li>
                <li><strong>Audits and Transparency:</strong> Each update will undergo third-party audits, with real-time Treasury dashboards expanded to include burn trackers and marketing spend logs.</li>
                <li><strong>Risk Mitigation:</strong> Allocations are dynamic but capped—e.g., burns won't exceed 20% to avoid over-deflation—and monitored for market impact.</li>
              </ul>
            </div>
          </div>

          <p className="future-plans-summary">
            These future plans position the Treasury as a dynamic engine for NUKE's longevity, transforming transaction taxes into multifaceted value: deeper liquidity, reduced supply via buybacks and burns, and strategic outreach. Holders can expect enhanced SOL yields, price resilience, and ecosystem expansion, all while maintaining the protocol's decentralized integrity. Stay tuned to the official channels for governance updates and proposal announcements.
          </p>
        </Accordion>
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
          Liquidity pools are the foundational building blocks of decentralized trading on Solana. They are smart contract-based reserves that hold pairs of tokens (e.g., NUKE/SOL), enabling users to buy, sell, or swap tokens instantly without needing a traditional order book or intermediary.
        </p>
        <p>
          In the NUKE protocol, liquidity pools operate on an <strong>Automated Market Maker (AMM)</strong> model, where prices are determined algorithmically based on the ratio of tokens in the pool (using constant product formulas like x * y = k in many cases, or more advanced variants). Traders interact directly with these pools: when someone buys NUKE, they add SOL and receive NUKE from the pool, shifting the ratio and slightly adjusting the price. The reverse happens on sells.
        </p>

        <div className="liquidity-characteristics">
          <h4 className="liquidity-characteristics-title">Key Characteristics of NUKE's Liquidity Pools:</h4>
          
          <div className="liquidity-char-item">
            <div className="liquidity-char-icon">🔒</div>
            <div className="liquidity-char-content">
              <h5>Irreversible Provision</h5>
              <p>At launch, liquidity provider (LP) tokens were fully burned, locking the initial liquidity permanently and making it rug-proof—no one can remove the LP tokens to drain the pool.</p>
            </div>
          </div>

          <div className="liquidity-char-item">
            <div className="liquidity-char-icon">🚫</div>
            <div className="liquidity-char-content">
              <h5>No Mint Authority</h5>
              <p>The NUKE token contract has mint authority revoked, preventing any additional token creation beyond the initial supply.</p>
            </div>
          </div>

          <div className="liquidity-char-item">
            <div className="liquidity-char-icon">💰</div>
            <div className="liquidity-char-content">
              <h5>Tax Integration</h5>
              <p>Every trade (buy/sell) incurs the uniform 3% transfer tax, which powers reflections (2% to SOL yields) and treasury (1% for compounding).</p>
            </div>
          </div>
        </div>

        <div className="liquidity-benefits">
          <h4 className="liquidity-benefits-title">Benefits for Traders and Holders:</h4>
          <ul>
            <li>Instant, permissionless trading with minimal slippage in deep pools.</li>
            <li>Passive SOL yield for holders through tax-driven reflections.</li>
            <li>Price discovery driven by market forces, with arbitrage helping maintain efficiency.</li>
          </ul>
        </div>

        <p className="doc-highlight">
          Liquidity pools provide constant availability for trading, reduce reliance on centralized exchanges, and create a self-sustaining ecosystem where volume generates value that flows back to holders.
        </p>
      </section>

      <section className="doc-section">
        <h3 className="doc-section-title">Liquidity Pool Ecosystem</h3>
        <p>
          NUKE employs a sophisticated <strong>multi-pool architecture</strong> with intentionally fragmented liquidity across multiple pools on leading Solana DEXes. This design is engineered to create perpetual baseline trading volume through automated arbitrage, ensuring consistent tax collection and SOL rewards even during low organic activity periods.
        </p>

        <Accordion title="Core Components of the Multi-Pool System">
          <div className="multipool-component">
            <h4 className="multipool-component-title">Fragmented Liquidity Distribution</h4>
            <p>
              Liquidity is spread across several pools with varying characteristics, rather than concentrated in a single large pool.
            </p>
            <p>
              This fragmentation dilutes the impact of large trades, reduces volatility at higher market caps, and maintains price stability while preserving predictable arbitrage flows.
            </p>
          </div>

          <div className="multipool-component">
            <h4 className="multipool-component-title">Diverse Pool Types and Fee Structures</h4>
            
            <div className="pool-type-list">
              <div className="pool-type-item">
                <h5 className="pool-type-name">Ultra-Low Fee Entry Pools</h5>
                <p>
                  E.g., Orca Whirlpool-style pools with ~0.01% fees, designed as easy entry points for small trades and frequent bot activity.
                </p>
              </div>

              <div className="pool-type-item">
                <h5 className="pool-type-name">Deep Constant Product Pools</h5>
                <p>
                  E.g., Raydium CPMM pools with 1–2% fees, providing substantial depth for larger trades and serving as primary arbitrage targets.
                </p>
              </div>

              <div className="pool-type-item">
                <h5 className="pool-type-name">Dynamic/Hedge Pools</h5>
                <p>
                  E.g., Meteora DLMM/DAMM or similar advanced pools that offer concentrated liquidity in specific price ranges, with fees largely compounded back into the pool.
                </p>
              </div>

              <div className="pool-type-item">
                <h5 className="pool-type-name">Micro Symbiote Pools</h5>
                <p>
                  Smaller, specialized pools that enhance routing options and create additional price discrepancy layers.
                </p>
              </div>
            </div>

            <p className="pool-fee-note">
              Fees across pools range from <strong>0.01% to 2%</strong>, with many configured to burn a portion (maximizing efficient routing) or compound internally for growth.
            </p>
          </div>
        </Accordion>

        <Accordion title="How Fragmentation Enables Arbitrage">
          <p>
            The intentional price and depth differences across these pools create natural inefficiencies that arbitrage bots exploit 24/7:
          </p>

          <div className="arbitrage-steps">
            <div className="arbitrage-step">
              <div className="arbitrage-step-number">1</div>
              <div className="arbitrage-step-content">
                <p>A trade on one pool shifts its price slightly.</p>
              </div>
            </div>

            <div className="arbitrage-step">
              <div className="arbitrage-step-number">2</div>
              <div className="arbitrage-step-content">
                <p>Bots detect the temporary discrepancy (e.g., NUKE cheaper on a low-fee entry pool than on a deep constant product pool).</p>
              </div>
            </div>

            <div className="arbitrage-step">
              <div className="arbitrage-step-number">3</div>
              <div className="arbitrage-step-content">
                <p>They buy low on one pool and sell high on another, profiting from the spread while rebalancing prices.</p>
              </div>
            </div>

            <div className="arbitrage-step">
              <div className="arbitrage-step-number">4</div>
              <div className="arbitrage-step-content">
                <p>This process generates reliable, mechanics-driven volume without depending on retail hype.</p>
              </div>
            </div>
          </div>

          <p className="arbitrage-highlight">
            Solana's high speed (thousands of TPS) and low fees make these micro-arbitrage opportunities highly profitable for bots, resulting in frequent trades that trigger the 3% tax repeatedly.
          </p>
        </Accordion>

        <Accordion title="The Liquidity Flywheel">
          <p>
            Treasury funds (from the 1% tax allocation) are 100% dedicated to compounding liquidity:
          </p>

          <div className="flywheel-process">
            <div className="flywheel-step">
              <div className="flywheel-step-icon">1️⃣</div>
              <div className="flywheel-step-content">
                <p>Accumulated NUKE is swapped to SOL.</p>
              </div>
            </div>

            <div className="flywheel-step">
              <div className="flywheel-step-icon">2️⃣</div>
              <div className="flywheel-step-content">
                <p>SOL is added to existing pools (prioritizing fragmented ones) to deepen depth and tighten spreads.</p>
              </div>
            </div>

            <div className="flywheel-step">
              <div className="flywheel-step-icon">3️⃣</div>
              <div className="flywheel-step-content">
                <p>Deeper liquidity attracts more arbitrage bots → higher baseline volume → more taxes collected → greater SOL reflections for holders → more treasury funds for further compounding.</p>
              </div>
            </div>
          </div>

          <div className="flywheel-cycle">
            <h4 className="flywheel-cycle-title">This creates a virtuous, self-reinforcing cycle:</h4>
            <ul>
              <li>Fragmented pools → engineered price discrepancies → constant bot arbitrage → perpetual volume.</li>
              <li>Treasury compounding → increased TVL → amplified arbitrage opportunities.</li>
              <li><strong>Overall:</strong> Consistent tax generation → automatic SOL airdrops to holders (pro-rata, no staking needed).</li>
            </ul>
          </div>
        </Accordion>

        <Accordion title="Additional Benefits of the Ecosystem">
          <div className="ecosystem-benefits">
            <div className="ecosystem-benefit-item">
              <h5>📊 Price Stability</h5>
              <p>Fragmentation prevents single-pool dominance and large whale impacts, leading to smoother price action.</p>
            </div>

            <div className="ecosystem-benefit-item">
              <h5>💎 Baseline Yield Assurance</h5>
              <p>Even in bearish or quiet markets, arbitrage provides minimum volume, ensuring rewards don't dry up.</p>
            </div>

            <div className="ecosystem-benefit-item">
              <h5>📈 Scalability and Resilience</h5>
              <p>As the protocol grows, treasury additions and future plans (e.g., burns with buybacks) further enhance depth and scarcity.</p>
            </div>

            <div className="ecosystem-benefit-item">
              <h5>🔍 Transparency</h5>
              <p>All pools, depths, and transactions are verifiable on Solana explorers. Real-time dashboards track TVL distribution and arbitrage activity.</p>
            </div>
          </div>

          <p className="ecosystem-summary">
            In summary, NUKE's liquidity pool ecosystem transforms traditional AMM limitations into a strength: engineered fragmentation powers reliable arbitrage volume, which fuels the hold-to-earn model. Holders benefit from passive SOL yields backed by mechanical sustainability, not speculation. For current pool details, visit the official dashboard or explore the contract addresses on Solscan/Explorer.
          </p>
        </Accordion>
      </section>
    </div>
  );
}

function FAQTab() {
  return (
    <div className="doc-tab-content">
      <section className="doc-section">
        <p className="faq-intro">
          Here are the most frequently asked questions about the NUKE protocol, covering core mechanics like the tax and token structure, followed by rewards, liquidity, treasury, and other common inquiries. These are based on the protocol's design as a hold-to-earn token on Solana with engineered arbitrage volume for sustainable SOL yields.
        </p>

        <Accordion title="What is the transfer tax on NUKE, and how does it work?">
          <p>
            NUKE applies a uniform <strong>3% transfer tax</strong> on every buy, sell, or transfer—no exceptions for fairness. This tax is automatically enforced on-chain. It breaks down as:
          </p>
          <ul>
            <li><strong>2%</strong> converted to SOL and distributed as passive reflections (rewards) to all holders</li>
            <li><strong>1%</strong> allocated to the Treasury for liquidity compounding</li>
          </ul>
          <p>
            Additionally, 1% of the collected tax tokens is burned per reward cycle to reduce supply.
          </p>
        </Accordion>

        <Accordion title="How do SOL rewards (reflections) work, and do I need to stake or claim them?">
          <p>
            <strong>No staking or claiming is required—it's pure hold-to-earn.</strong> The 2% tax portion accumulates in a reward pool from every transaction. Approximately every 10 minutes, accumulated NUKE is automatically swapped to SOL and airdropped pro-rata to all holders based on their share of the circulating supply.
          </p>
          <p>
            Your rewards scale directly with your holdings and protocol volume.
          </p>
        </Accordion>

        <Accordion title="Why does NUKE use a multi-pool liquidity architecture?">
          <p>
            Liquidity is intentionally fragmented across multiple pools on Solana DEXes (e.g., ultra-low fee entry pools at 0.01%, deep constant product pools at 1-2%, dynamic hedge pools, and micro symbiote pools). This creates natural price discrepancies that attract arbitrage bots 24/7, generating reliable baseline trading volume.
          </p>
          <p>
            This ensures consistent tax collection and SOL rewards even in low-organic trading periods.
          </p>
        </Accordion>

        <Accordion title="How does the arbitrage flywheel create sustainable volume?">
          <p>
            Fragmented pools lead to temporary price differences after trades. Arbitrage bots exploit these for profit, buying low in one pool and selling high in another. This rebalances prices while triggering the 3% tax repeatedly.
          </p>
          <p>
            Solana's high speed and low fees make these micro-arbitrages highly profitable for bots, creating perpetual, mechanics-driven volume that powers rewards without relying on hype.
          </p>
        </Accordion>

        <Accordion title="What happens to the Treasury funds?">
          <p>
            The Treasury receives the 1% tax allocation and is currently dedicated <strong>100% to liquidity compounding</strong>. Accumulated NUKE is swapped to SOL and added to pools to deepen liquidity, tighten spreads, and attract more arbitrage.
          </p>
          <p>
            This creates a compounding loop: deeper liquidity → more bot activity → higher volume → more taxes → amplified rewards.
          </p>
          <p>
            Future plans include introducing deflationary burns with buybacks (~10-20%) and strategic marketing (~20-30%), subject to community governance.
          </p>
        </Accordion>

        <Accordion title="Is NUKE deflationary, and how do burns work?">
          <p>
            <strong>Not Yet, Future Plans:</strong> NUKE includes deflationary mechanics. 1% of collected tax tokens is burned per reward cycle, permanently reducing supply.
          </p>
          <p>
            In future phases, Treasury funds will support additional buybacks (using SOL to purchase NUKE from the market) followed by burns. This increases scarcity, boosts each holder's proportional ownership, supports price stability, and amplifies per-holder SOL yields over time.
          </p>
        </Accordion>

        <Accordion title="Is the protocol safe and rug-proof?">
          <p>
            <strong>Yes</strong>—mint authority is revoked (no more tokens can be created), LP tokens were fully burned at launch (liquidity is irreversible), and contract ownership is renounced.
          </p>
          <p>
            All processes (tax collection, swaps, distributions) are automated and on-chain. No team or founder extractions are possible; everything is transparent and verifiable on Solana explorers like Solscan.
          </p>
        </Accordion>

        <Accordion title="How can I track my SOL rewards and Treasury activity?">
          <p>
            Rewards are automatically airdropped to your wallet—check your SOL balance over time. Use Solana explorers (e.g., Solscan or Explorer.solana.com) to view the contract, reward pool, Treasury wallet, and burn transactions.
          </p>
          <p>
            The official dashboard provides real-time stats on TVL distribution, arbitrage volume, and cumulative rewards.
          </p>
        </Accordion>

        <Accordion title="Does holding NUKE require any active participation?">
          <p>
            <strong>No</strong>—simply hold NUKE in your Solana wallet (e.g., Phantom, Solflare). Rewards are passive and pro-rata. No staking, no claiming, no gas fees from your side—the protocol handles everything automatically.
          </p>
        </Accordion>

        <Accordion title="What makes NUKE different from typical Solana meme tokens?">
          <p>
            Most rely on hype for volume, which fades quickly. NUKE uses <strong>engineered mechanics</strong> (multi-pool fragmentation + arbitrage bots) for perpetual baseline volume, ensuring consistent taxes and SOL yields.
          </p>
          <p>
            It focuses on sustainability through liquidity flywheel, burns, and Treasury compounding, rather than speculation.
          </p>
        </Accordion>

        <Accordion title="Can large trades or whales disrupt the price?">
          <p>
            Fragmented liquidity dilutes the impact of large trades across multiple pools, reducing volatility and preventing single-pool dominance.
          </p>
          <p>
            Deeper Treasury-compounded pools further stabilize price action while maintaining arbitrage opportunities.
          </p>
        </Accordion>

        <Accordion title="What are the future plans for the protocol?">
          <p>
            <strong>Phase 1</strong> focuses on liquidity compounding (current 100%). Future phases include:
          </p>
          <ul>
            <li>Introducing Treasury-allocated deflationary buybacks and burns for accelerated scarcity</li>
            <li>Strategic marketing for organic growth (via community governance)</li>
            <li>Potential integrations to enhance the flywheel</li>
          </ul>
          <p>
            All changes are voted on by holders through lightweight DAO tools.
          </p>
        </Accordion>

        <Accordion title="How do I buy NUKE?">
          <p>
            Use a Solana wallet like Phantom, connect to a DEX (e.g., Raydium, Jupiter), and swap SOL for NUKE via available pools.
          </p>
          <p>
            Search for the official contract address on DEX screeners or the project dashboard to avoid scams. <strong>Always verify the mint address.</strong>
          </p>
        </Accordion>

        <Accordion title="Are there any risks I should know about?">
          <p>
            Like all crypto, NUKE carries risks:
          </p>
          <ul>
            <li>High volatility</li>
            <li>Smart contract vulnerabilities (though audited and renounced)</li>
            <li>Market downturns affecting volume</li>
            <li>Arbitrage fluctuations</li>
            <li>Regulatory uncertainty</li>
          </ul>
          <p>
            Rewards depend on trading activity; baseline is engineered but not guaranteed. <strong>DYOR and only invest what you can afford to lose.</strong>
          </p>
        </Accordion>

        <Accordion title="Where can I learn more or join the community?">
          <p>
            Check the official website dashboard, whitepaper, and contract on Solana explorers. Join community channels (e.g., Telegram, X/Discord) for updates, governance proposals, and real-time discussions.
          </p>
          <p>
            All on-chain data is public for full transparency.
          </p>
        </Accordion>

        <div className="faq-footer">
          <p>
            <strong>These FAQs cover the essentials—feel free to reach out in the community for more details! Always verify information on-chain.</strong>
          </p>
        </div>
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

