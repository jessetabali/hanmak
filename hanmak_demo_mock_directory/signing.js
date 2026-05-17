/* ===== Signing Workflow Page ===== */
const signingWorkflowState = {
  stateSelected: false,
  consentAccepted: false,
  signatureApplied: false,
  initialsApplied: false,
  submitted: false,
  managerApproved: false,
  legalApproved: false,
  evidenceGenerated: false,
  events: [
    {event:'Document opened', time:'just now', user:'Sarah Johnson'},
  ],
};

registerPage('signing', () => `
<div style="margin:-28px;display:flex;flex-direction:column;height:calc(100vh - 56px);">

  <!-- Signing Toolbar -->
  <div style="background:white;border-bottom:1px solid var(--border);padding:10px 20px;display:flex;align-items:center;gap:12px;flex-shrink:0;">
    <div style="flex:1;">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);">NDA Agreement — Acme × TechCorp</div>
      <div id="signing-summary" style="font-size:11px;color:var(--text-secondary);">Signing as: <strong>Sarah Johnson</strong> · Party 2 · Loading progress...</div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;">
      <span class="badge badge-warning">In Progress</span>
      <button class="btn btn-ghost btn-sm">Download Copy</button>
      <button class="btn btn-danger btn-sm" onclick="openInternalDeclineSigningModal()">Decline</button>
    </div>
  </div>

  <!-- 2-panel layout -->
  <div style="display:grid;grid-template-columns:1fr 360px;flex:1;overflow:hidden;">

    <!-- Document area -->
    <div style="background:#e8edf4;overflow-y:auto;padding:32px;display:flex;flex-direction:column;align-items:center;gap:20px;">

      <!-- Page 1 -->
      <div style="width:100%;max-width:680px;background:white;box-shadow:0 4px 20px rgba(0,0,0,0.1);border-radius:2px;padding:60px;position:relative;">

        <div style="text-align:center;margin-bottom:32px;">
          <div style="font-size:20px;font-weight:700;color:#1e293b;margin-bottom:6px;">NON-DISCLOSURE AGREEMENT</div>
          <div style="font-size:12px;color:#64748b;">Acme Corporation × TechCorp Inc. · Effective Date: January 15, 2025</div>
        </div>

        <div style="font-size:12px;line-height:2;color:#334155;margin-bottom:16px;">
          <strong>1. PARTIES.</strong> This Agreement is entered into between <strong>Acme Corporation</strong> ("Disclosing Party") and <strong>TechCorp Inc.</strong> ("Receiving Party").
        </div>

        <div style="font-size:12px;line-height:2;color:#334155;margin-bottom:16px;">
          <strong>2. CONFIDENTIAL INFORMATION.</strong> "Confidential Information" means any information disclosed by either party to the other party, either directly or indirectly, in writing, orally, or by inspection of tangible objects that is designated as "Confidential," "Proprietary," or similar.
        </div>

        <div style="font-size:12px;line-height:2;color:#334155;margin-bottom:16px;">
          <strong>3. OBLIGATIONS.</strong> Each party agrees to hold the other party's Confidential Information in strict confidence; not to disclose such information to any third parties; and to use Confidential Information only for the stated purpose.
        </div>

        <div style="font-size:12px;line-height:2;color:#334155;margin-bottom:16px;">
          <strong>4. TERM.</strong> This Agreement shall remain in effect for a period of <strong>3 years</strong> from the date of execution.
        </div>

        <div style="font-size:12px;line-height:2;color:#334155;margin-bottom:32px;">
          <strong>5. JURISDICTION.</strong> This Agreement shall be governed by the laws of the State of:
          <!-- Fillable dropdown field -->
          <span onclick="showStateDropdown(this)" style="display:inline-block;min-width:130px;padding:2px 8px;border:1.5px solid var(--warning);border-radius:4px;background:#fffbeb;color:var(--text-primary);cursor:pointer;font-size:12px;font-weight:500;vertical-align:middle;margin-left:4px;" id="state-field">
            Click to select state ▼
          </span>
        </div>

        <!-- Signing section -->
        <div style="margin-top:48px;padding-top:24px;border-top:2px solid #e2e8f0;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;">

            <!-- Party 1 (pre-signed) -->
            <div>
              <div style="font-size:11px;color:#64748b;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Disclosing Party</div>
              <div style="height:60px;border-bottom:2px solid #cbd5e1;display:flex;align-items:flex-end;padding-bottom:4px;margin-bottom:8px;">
                <span style="font-family:'Dancing Script',cursive;font-size:32px;color:#1e40af;">James Carter</span>
              </div>
              <div style="font-size:11px;color:#334155;"><strong>James Carter</strong> · CEO, Acme Corp</div>
              <div style="font-size:10px;color:#94a3b8;">Signed: Jan 14, 2025 · 14:32 UTC</div>
            </div>

            <!-- Party 2 — needs signature -->
            <div>
              <div style="font-size:11px;color:#64748b;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Receiving Party <span style="color:var(--warning);">*Required</span></div>
              <div onclick="openSignatureModal()" id="sig-box"
                style="height:60px;border:2px dashed var(--accent);border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:var(--accent-light);margin-bottom:8px;transition:all 0.15s ease;"
                onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='var(--accent-light)'">
                <span style="font-size:12px;font-weight:600;color:var(--accent);">✍ Click to sign</span>
              </div>
              <div id="sig-name-line" style="font-size:11px;color:#94a3b8;">Awaiting signature from Sarah Johnson</div>
              <input id="sig-email" class="form-input" type="email" placeholder="Your email address" value="sarah@techcorp.com" style="margin-top:8px;font-size:11px;">
            </div>
          </div>

          <!-- Initials row -->
          <div style="margin-top:24px;display:flex;gap:16px;align-items:center;">
            <div onclick="openInitialsModal()" id="initials-box"
              style="width:70px;height:36px;border:2px dashed var(--accent);border-radius:4px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:var(--accent-light);"
              onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='var(--accent-light)'">
              <span style="font-size:11px;font-weight:600;color:var(--accent);">Initials</span>
            </div>
            <div style="font-size:11px;color:#64748b;">I confirm I have read and agree to the terms of this Agreement.</div>
          </div>
        </div>

      </div>

      <!-- Navigation buttons -->
      <div style="display:flex;gap:10px;align-items:center;">
        <button class="btn btn-secondary">← Previous page</button>
        <span style="font-size:12px;color:var(--text-secondary);">Page 1 of 3</span>
        <button class="btn btn-secondary">Next page →</button>
      </div>

    </div>

    <!-- RIGHT: Workflow Steps Panel -->
    <div style="background:var(--bg-card);border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">

      <!-- Header -->
      <div style="padding:20px;border-bottom:1px solid var(--border);">
        <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">Signing Progress</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="progress-bar" style="flex:1;">
            <div class="progress-fill" id="signing-progress-fill" style="width:0%;"></div>
          </div>
          <span id="signing-progress-percent" style="font-size:12px;font-weight:600;color:var(--text-secondary);">0%</span>
        </div>
      </div>

      <!-- Steps -->
      <div style="flex:1;overflow-y:auto;padding:16px;">
        <div style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">Workflow Steps</div>

        <div id="signing-workflow-steps"></div>

        <!-- Parties involved -->
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border-light);">
          <div style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Parties</div>
          <div id="signing-parties"></div>
        </div>

        <!-- Audit trail preview -->
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-light);">
          <div style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Audit Trail</div>
          <div id="signing-audit"></div>
        </div>
      </div>

      <!-- Submit button -->
      <div style="padding:16px;border-top:1px solid var(--border);background:var(--bg-surface);">
        <div class="alert alert-warning" id="signing-submit-alert" style="margin-bottom:12px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Complete all required fields before submitting.
        </div>
        <button class="btn btn-primary w-full" id="signing-primary-action" onclick="handleSigningPrimaryAction()" style="justify-content:center;">
          Continue to E-Signature Consent →
        </button>
      </div>

    </div>
  </div>
</div>
`);

function openInternalDeclineSigningModal() {
  openModal(`
    <div class="modal">
      <div class="modal-header"><h3 class="modal-title">${icon('x-circle')} Decline Signing</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Reason</label><textarea id="internal-decline-reason" class="form-input" rows="3" placeholder="Explain why this document cannot be signed."></textarea></div>
        <p style="font-size:0.8125rem;color:var(--text-muted)">This internal workflow preview will be marked declined. Public signer links use the live API decline action.</p>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="declineInternalSigningWorkflow()">${icon('x-circle')} Decline</button></div>
    </div>
  `);
}

function declineInternalSigningWorkflow() {
  signingWorkflowState.submitted = false;
  signingWorkflowState.events.push({event: 'Signing declined', time: 'just now', user: 'Sarah Johnson'});
  closeModal();
  const summary = document.getElementById('signing-summary');
  if (summary) summary.innerHTML = '<strong>Declined</strong> · This internal preview has been closed.';
  document.querySelector('.badge.badge-warning')?.classList.replace('badge-warning', 'badge-danger');
  showToast('Signing workflow declined', 'error');
}

function signing_init() {
  updateSigningWorkflowUI();
}

function addSigningEvent(event, user = 'Sarah Johnson') {
  signingWorkflowState.events.unshift({event, time:'now', user});
}

function signingRequiredFieldProgress() {
  const completed = 3 + (signingWorkflowState.stateSelected ? 1 : 0);
  return {completed, total: 4, remaining: 4 - completed};
}

function signingStepStatus(step) {
  const s = signingWorkflowState;
  if (step === 1) return 'completed';
  if (step === 2) return s.stateSelected ? 'completed' : 'current';
  if (step === 3) return s.consentAccepted ? 'completed' : s.stateSelected ? 'current' : 'pending';
  if (step === 4) return s.signatureApplied ? 'completed' : s.consentAccepted ? 'current' : 'pending';
  if (step === 5) return s.initialsApplied ? 'completed' : s.signatureApplied ? 'current' : 'pending';
  if (step === 6) return s.submitted ? 'completed' : s.initialsApplied ? 'current' : 'pending';
  if (step === 7) return s.managerApproved ? 'completed' : s.submitted ? 'current' : 'pending';
  if (step === 8) return s.legalApproved ? 'completed' : s.managerApproved ? 'current' : 'pending';
  if (step === 9) return s.evidenceGenerated ? 'completed' : s.legalApproved ? 'current' : 'pending';
  return 'pending';
}

function signingWorkflowSteps() {
  const fieldProgress = signingRequiredFieldProgress();
  return [
    [1, 'Open Document', 'Review all pages of the agreement'],
    [2, 'Fill Required Fields', `${fieldProgress.completed} of ${fieldProgress.total} fields completed — ${fieldProgress.remaining} remaining`],
    [3, 'E-Signature Consent', 'Accept the electronic signature disclosure'],
    [4, 'Apply Your Signature', 'Draw or type your signature'],
    [5, 'Add Initials', 'Confirm page agreements with initials'],
    [6, 'Submit for Approval', 'Send to manager for final review'],
    [7, 'Manager Approval', 'Michael Chen — Finance Manager'],
    [8, 'Legal Review', 'Legal team final approval'],
    [9, 'Completion & Evidence', 'Evidence bundle generated'],
  ];
}

function updateSigningWorkflowUI() {
  const steps = signingWorkflowSteps();
  const completedSteps = steps.filter(([step]) => signingStepStatus(step) === 'completed').length;
  const progress = Math.round((completedSteps / steps.length) * 100);
  const fieldProgress = signingRequiredFieldProgress();

  const stepContainer = document.getElementById('signing-workflow-steps');
  if (stepContainer) {
    stepContainer.innerHTML = steps.map(([step, title, desc]) =>
      workflowStep(step, title, desc, signingStepStatus(step), String(step))
    ).join('');
  }

  const summary = document.getElementById('signing-summary');
  if (summary) {
    summary.innerHTML = `Signing as: <strong>Sarah Johnson</strong> · Party 2 · ${fieldProgress.remaining} required field${fieldProgress.remaining === 1 ? '' : 's'} remaining`;
  }

  const fill = document.getElementById('signing-progress-fill');
  if (fill) fill.style.width = `${progress}%`;
  const percent = document.getElementById('signing-progress-percent');
  if (percent) percent.textContent = `${progress}%`;

  const alert = document.getElementById('signing-submit-alert');
  const action = document.getElementById('signing-primary-action');
  if (alert && action) updateSigningPrimaryAction(alert, action);

  renderSigningParties();
  renderSigningAudit();
}

function updateSigningPrimaryAction(alert, action) {
  const s = signingWorkflowState;
  if (!s.stateSelected) {
    alert.className = 'alert alert-warning';
    alert.innerHTML = `${icon('alert-circle', 14)} Select the jurisdiction field before continuing.`;
    action.className = 'btn btn-primary w-full';
    action.innerHTML = 'Select Required Fields';
    action.disabled = false;
    return;
  }
  if (!s.consentAccepted) {
    alert.className = 'alert alert-info';
    alert.innerHTML = `${icon('shield', 14)} Required fields are complete. Review the e-signature consent.`;
    action.className = 'btn btn-primary w-full';
    action.innerHTML = 'Continue to E-Signature Consent';
    action.disabled = false;
    return;
  }
  if (!s.signatureApplied) {
    alert.className = 'alert alert-info';
    alert.innerHTML = `${icon('edit', 14)} Consent accepted. Apply your signature next.`;
    action.className = 'btn btn-primary w-full';
    action.innerHTML = 'Apply Signature';
    action.disabled = false;
    return;
  }
  if (!s.initialsApplied) {
    alert.className = 'alert alert-info';
    alert.innerHTML = `${icon('edit', 14)} Signature applied. Add your initials to confirm the page.`;
    action.className = 'btn btn-primary w-full';
    action.innerHTML = 'Add Initials';
    action.disabled = false;
    return;
  }
  if (!s.submitted) {
    alert.className = 'alert alert-success';
    alert.innerHTML = `${icon('check', 14)} Signing package is ready for approval.`;
    action.className = 'btn btn-success w-full';
    action.innerHTML = 'Submit for Approval';
    action.disabled = false;
    return;
  }
  if (!s.evidenceGenerated) {
    alert.className = 'alert alert-info';
    alert.innerHTML = `${icon('refresh', 14)} Approval workflow is running.`;
    action.className = 'btn btn-secondary w-full';
    action.innerHTML = 'Workflow Running...';
    action.disabled = true;
    return;
  }
  alert.className = 'alert alert-success';
  alert.innerHTML = `${icon('check', 14)} Complete. Evidence bundle generated.`;
  action.className = 'btn btn-success w-full';
  action.innerHTML = 'Download Completed Copy';
  action.disabled = false;
}

function renderSigningParties() {
  const s = signingWorkflowState;
  const parties = [
    {name:'James Carter', role:'Sender / Party 1', status:'Signed', color:'success'},
    {name:'Sarah Johnson', role:'Signer / Party 2', status:s.submitted ? 'Submitted' : s.initialsApplied ? 'Ready' : 'In Progress', color:s.submitted ? 'success' : 'warning'},
    {name:'Michael Chen', role:'Manager Approver', status:s.managerApproved ? 'Approved' : s.submitted ? 'Reviewing' : 'Pending', color:s.managerApproved ? 'success' : s.submitted ? 'warning' : 'gray'},
    {name:'Legal Team', role:'Legal Approver', status:s.legalApproved ? 'Approved' : s.managerApproved ? 'Reviewing' : 'Pending', color:s.legalApproved ? 'success' : s.managerApproved ? 'warning' : 'gray'},
  ];
  const container = document.getElementById('signing-parties');
  if (!container) return;
  container.innerHTML = parties.map(p => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      ${avatar(p.name, 28)}
      <div style="flex:1;">
        <div style="font-size:12px;font-weight:600;color:var(--text-primary);">${p.name}</div>
        <div style="font-size:10px;color:var(--text-secondary);">${p.role}</div>
      </div>
      <span class="badge badge-${p.color === 'gray' ? 'gray' : p.color}">${p.status}</span>
    </div>
  `).join('');
}

function renderSigningAudit() {
  const container = document.getElementById('signing-audit');
  if (!container) return;
  container.innerHTML = signingWorkflowState.events.slice(0, 8).map(e => `
    <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;padding-left:10px;border-left:2px solid var(--border);">
      <span style="font-weight:600;color:var(--text-primary);">${e.event}</span><br>
      ${e.user} · ${e.time}
    </div>
  `).join('');
}

function handleSigningPrimaryAction() {
  const s = signingWorkflowState;
  if (!s.stateSelected) {
    const field = document.getElementById('state-field');
    field?.scrollIntoView({behavior:'smooth', block:'center'});
    if (field) showStateDropdown(field);
    showToast('Select the State / Jurisdiction field first', 'info');
    return;
  }
  if (!s.consentAccepted) return showConsentModal();
  if (!s.signatureApplied) return openSignatureModal();
  if (!s.initialsApplied) return openInitialsModal();
  if (!s.submitted) return submitSigningForApproval();
  if (s.evidenceGenerated) return showToast('Completed copy is ready in the evidence bundle', 'success');
}

function workflowStep(num, title, desc, status, label) {
  const colors = { completed: 'success', current: 'accent', pending: 'gray' };
  const bg = { completed: 'var(--success)', current: 'var(--accent)', pending: 'var(--border)' };
  return `
    <div style="display:flex;gap:12px;padding:10px;border-radius:var(--radius-md);margin-bottom:6px;border:1.5px solid ${status==='current'?'var(--accent)':status==='completed'?'var(--success-light)':'var(--border-light)'};background:${status==='current'?'var(--accent-light)':status==='completed'?'var(--success-light)':status==='pending'?'transparent':'transparent'};">
      <div style="width:24px;height:24px;border-radius:50%;background:${bg[status]};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:white;flex-shrink:0;">${status==='completed'?'✓':label}</div>
      <div style="flex:1;">
        <div style="font-size:12px;font-weight:600;color:${status==='pending'?'var(--text-secondary)':'var(--text-primary)'};">${title}</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px;">${desc}</div>
      </div>
    </div>
  `;
}

// ---- Signature Drawing Modal ----
function openSignatureModal() {
  openModal(`
    <div class="modal modal-lg">
      <div class="modal-header">
        <div>
          <div class="modal-title">✍ Apply Your Signature</div>
          <div class="modal-subtitle">Draw, type, or upload your signature to sign this document</div>
        </div>
        <button class="modal-close" onclick="closeModal()">${icon('x',16)}</button>
      </div>
      <div class="modal-body" style="padding:0;">

        <!-- Tabs -->
        <div style="display:flex;border-bottom:1px solid var(--border);">
          <div class="signature-pad-tab active" id="sig-tab-draw" onclick="switchSigTab('draw')">✏️ Draw</div>
          <div class="signature-pad-tab" id="sig-tab-type" onclick="switchSigTab('type')">Aa Type</div>
          <div class="signature-pad-tab" id="sig-tab-upload" onclick="switchSigTab('upload')">📎 Upload</div>
        </div>

        <!-- Draw Tab -->
        <div id="sig-panel-draw" style="padding:20px;">
          <div style="background:#f8fafc;border:2px dashed var(--border);border-radius:var(--radius-lg);overflow:hidden;position:relative;">
            <div style="background:#1e40af;color:white;font-size:10px;font-weight:600;padding:4px 12px;text-align:center;letter-spacing:0.06em;text-transform:uppercase;">
              Draw your signature in the area below
            </div>
            <canvas id="sig-canvas" width="700" height="180"
              style="display:block;width:100%;height:180px;cursor:crosshair;background:white;touch-action:none;">
            </canvas>
            <div style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%);border-bottom:1.5px solid #94a3b8;width:60%;pointer-events:none;"></div>
            <div style="text-align:center;padding:6px;font-size:10px;color:var(--text-tertiary);">Sign above the line</div>
          </div>

          <!-- Pen controls -->
          <div style="display:flex;gap:12px;align-items:center;margin-top:16px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:12px;color:var(--text-secondary);">Color:</span>
              ${['#1e3a5f','#0f172a','#1e40af','#374151','#991b1b'].map(c => `
                <div onclick="setSigColor('${c}')" style="width:22px;height:22px;background:${c};border-radius:50%;cursor:pointer;border:2px solid transparent;" class="sig-color-swatch"></div>
              `).join('')}
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:12px;color:var(--text-secondary);">Size:</span>
              <input type="range" id="sig-pen-size" min="1" max="6" value="2" style="width:80px;accent-color:var(--accent);" oninput="sigPenSize=this.value">
            </div>
            <button class="btn btn-ghost btn-sm" onclick="clearSigCanvas()" style="margin-left:auto;">${icon('trash')} Clear</button>
            <button class="btn btn-ghost btn-sm" onclick="undoSigStroke()">${icon('refresh')} Undo</button>
          </div>
        </div>

        <!-- Type Tab -->
        <div id="sig-panel-type" style="display:none;padding:20px;">
          <div class="form-group">
            <label class="form-label">Type your full legal name</label>
            <input class="form-input" type="text" id="sig-typed-name" placeholder="Sarah Johnson" value="Sarah Johnson" style="font-size:14px;" oninput="updateTypedSigPreview(this.value)">
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">Choose a signature style:</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            ${['Dancing Script','Pacifico','Satisfy','Great Vibes'].map((font,i) => `
              <div onclick="selectTypedSigStyle(this,'${font}')" style="padding:16px;border:2px solid ${i===0?'var(--accent)':'var(--border)'};border-radius:var(--radius-md);cursor:pointer;text-align:center;transition:all 0.15s;" class="typed-sig-option" data-font="${font}">
                <div style="font-family:'${font}',cursive;font-size:26px;color:#1e3a5f;line-height:1.2;">Sarah Johnson</div>
                <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;">${font}</div>
              </div>
            `).join('')}
          </div>
          <div id="typed-sig-preview" style="margin-top:16px;padding:16px;background:#f8fafc;border-radius:var(--radius-md);text-align:center;">
            <div style="font-family:'Dancing Script',cursive;font-size:36px;color:#1e40af;" id="typed-sig-name">Sarah Johnson</div>
            <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;">Preview of your signature</div>
          </div>
        </div>

        <!-- Upload Tab -->
        <div id="sig-panel-upload" style="display:none;padding:20px;">
          <div class="upload-area" onclick="showToast('File picker opened','info')">
            <div class="upload-icon">${icon('upload',20)}</div>
            <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">Upload signature image</div>
            <div style="font-size:12px;color:var(--text-secondary);">PNG or JPG with transparent background · Max 2MB</div>
          </div>
          <div class="alert alert-info" style="margin-top:12px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Upload a PNG with a transparent background for best results. Your signature will be embedded in the document.
          </div>
        </div>

      </div>
      <div class="modal-footer">
        <div style="flex:1;font-size:11px;color:var(--text-secondary);">
          By applying your signature you agree to the Electronic Signature Consent and Terms.
        </div>
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-success" onclick="applySignature()">${icon('check')} Apply Signature</button>
      </div>
    </div>
  `);

  // Init canvas after modal renders
  setTimeout(initSigCanvas, 50);
}

// Canvas drawing logic
let sigCanvas, sigCtx, sigDrawing = false, sigPenSize = 2, sigPenColor = '#1e3a5f';
let sigStrokes = [];
let currentStroke = [];

function initSigCanvas() {
  sigCanvas = document.getElementById('sig-canvas');
  if (!sigCanvas) return;

  // Scale canvas for retina
  const rect = sigCanvas.getBoundingClientRect();
  sigCanvas.width = rect.width * window.devicePixelRatio;
  sigCanvas.height = rect.height * window.devicePixelRatio;

  sigCtx = sigCanvas.getContext('2d');
  sigCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  sigCtx.strokeStyle = sigPenColor;
  sigCtx.lineWidth = sigPenSize;
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';

  function getPos(e) {
    const r = sigCanvas.getBoundingClientRect();
    if (e.touches) {
      return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    }
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function startDraw(e) {
    sigDrawing = true;
    currentStroke = [];
    const pos = getPos(e);
    sigCtx.beginPath();
    sigCtx.moveTo(pos.x, pos.y);
    currentStroke.push(pos);
    e.preventDefault();
  }

  function draw(e) {
    if (!sigDrawing) return;
    const pos = getPos(e);
    sigCtx.strokeStyle = sigPenColor;
    sigCtx.lineWidth = parseInt(sigPenSize) || 2;
    sigCtx.lineTo(pos.x, pos.y);
    sigCtx.stroke();
    currentStroke.push(pos);
    e.preventDefault();
  }

  function endDraw(e) {
    if (!sigDrawing) return;
    sigDrawing = false;
    if (currentStroke.length > 1) sigStrokes.push([...currentStroke]);
    currentStroke = [];
    sigCtx.closePath();
  }

  sigCanvas.addEventListener('mousedown', startDraw);
  sigCanvas.addEventListener('mousemove', draw);
  sigCanvas.addEventListener('mouseup', endDraw);
  sigCanvas.addEventListener('mouseleave', endDraw);
  sigCanvas.addEventListener('touchstart', startDraw, { passive: false });
  sigCanvas.addEventListener('touchmove', draw, { passive: false });
  sigCanvas.addEventListener('touchend', endDraw);
}

function setSigColor(color) {
  sigPenColor = color;
  document.querySelectorAll('.sig-color-swatch').forEach(el => {
    el.style.border = el.style.background === color ? '2px solid var(--accent)' : '2px solid transparent';
  });
}

function clearSigCanvas() {
  if (!sigCtx || !sigCanvas) return;
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  sigStrokes = [];
}

function undoSigStroke() {
  if (!sigStrokes.length || !sigCtx || !sigCanvas) return;
  sigStrokes.pop();
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  sigCtx.strokeStyle = sigPenColor;
  sigCtx.lineWidth = parseInt(sigPenSize) || 2;
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';
  sigStrokes.forEach(stroke => {
    if (stroke.length < 2) return;
    sigCtx.beginPath();
    sigCtx.moveTo(stroke[0].x, stroke[0].y);
    stroke.slice(1).forEach(pt => sigCtx.lineTo(pt.x, pt.y));
    sigCtx.stroke();
    sigCtx.closePath();
  });
}

function switchSigTab(tab) {
  ['draw','type','upload'].forEach(t => {
    const tabEl = document.getElementById('sig-tab-' + t);
    const panelEl = document.getElementById('sig-panel-' + t);
    if (tabEl) tabEl.classList.toggle('active', t === tab);
    if (panelEl) panelEl.style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'draw') setTimeout(initSigCanvas, 50);
}

function updateTypedSigPreview(name) {
  const el = document.getElementById('typed-sig-name');
  if (el) el.textContent = name || 'Your Name';
}

function selectTypedSigStyle(el, font) {
  document.querySelectorAll('.typed-sig-option').forEach(o => o.style.border = '2px solid var(--border)');
  el.style.border = '2px solid var(--accent)';
  const preview = document.getElementById('typed-sig-name');
  if (preview) preview.style.fontFamily = `'${font}', cursive`;
}

function applySignature() {
  closeModal();
  // Update the signature box in the document
  const sigBox = document.getElementById('sig-box');
  if (sigBox) {
    sigBox.style.border = '2px solid var(--success)';
    sigBox.style.background = 'white';
    sigBox.style.cursor = 'default';
    sigBox.innerHTML = '<span style="font-family:\'Dancing Script\',cursive;font-size:32px;color:#1e40af;">Sarah Johnson</span>';
    sigBox.onclick = null;
  }
  const nameLine = document.getElementById('sig-name-line');
  if (nameLine) {
    nameLine.style.color = 'var(--success)';
    nameLine.textContent = '✓ Signed by Sarah Johnson · ' + new Date().toLocaleString();
  }
  signingWorkflowState.signatureApplied = true;
  addSigningEvent('Signature applied');
  updateSigningWorkflowUI();
  showToast('Signature applied successfully!', 'success');
}

function openInitialsModal() {
  openModal(`
    <div class="modal modal-sm">
      <div class="modal-header">
        <div class="modal-title">Add Initials</div>
        <button class="modal-close" onclick="closeModal()">${icon('x',16)}</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Your Initials</label>
          <input class="form-input" type="text" value="S.J." placeholder="e.g. S.J." style="font-size:18px;text-align:center;letter-spacing:0.2em;">
        </div>
        <div style="text-align:center;margin-top:12px;padding:20px;background:#f8fafc;border-radius:var(--radius-md);">
          <div style="font-family:'Dancing Script',cursive;font-size:42px;color:#1e40af;">S.J.</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-success" onclick="applyInitials()">${icon('check')} Apply Initials</button>
      </div>
    </div>
  `);
}

function applyInitials() {
  closeModal();
  const box = document.getElementById('initials-box');
  if (box) {
    box.style.border = '2px solid var(--success)';
    box.style.background = 'white';
    box.innerHTML = '<span style="font-family:\'Dancing Script\',cursive;font-size:22px;color:#1e40af;">S.J.</span>';
    box.onclick = null;
  }
  signingWorkflowState.initialsApplied = true;
  addSigningEvent('Initials applied');
  updateSigningWorkflowUI();
  showToast('Initials applied', 'success');
}

function showConsentModal() {
  if (!signingWorkflowState.consentAccepted) {
    addSigningEvent('Consent disclosure viewed');
    updateSigningWorkflowUI();
  }
  openModal(`
    <div class="modal">
      <div class="modal-header">
        <div>
          <div class="modal-title">Electronic Signature Consent</div>
          <div class="modal-subtitle">Please read and accept before signing</div>
        </div>
        <button class="modal-close" onclick="closeModal()">${icon('x',16)}</button>
      </div>
      <div class="modal-body">
        <div style="background:var(--bg-surface);border-radius:var(--radius-md);padding:16px;max-height:240px;overflow-y:auto;font-size:12px;line-height:1.8;color:var(--text-secondary);margin-bottom:16px;border:1px solid var(--border);">
          <strong style="color:var(--text-primary);">ELECTRONIC RECORD AND SIGNATURE DISCLOSURE</strong><br><br>
          By using electronic signatures, you are consenting to use electronic means to execute this document. Your electronic signature is legally binding and equivalent to your handwritten signature.<br><br>
          You have the right to receive a paper copy of this document. You may withdraw consent at any time. Your consent applies to this transaction only.<br><br>
          By clicking "I Agree & Continue," you: (1) agree to sign electronically; (2) confirm you can access this document; (3) agree to the terms of HanMak Electronic Signature Policy.
        </div>
        <label class="checkbox-wrap" style="margin-bottom:12px;">
          <input type="checkbox" id="consent-check" class="perm-check">
          <span class="checkbox-label" style="font-size:13px;font-weight:500;">I agree to use electronic records and signatures for this document</span>
        </label>
        <label class="checkbox-wrap">
          <input type="checkbox" id="identity-check" class="perm-check">
          <span class="checkbox-label" style="font-size:13px;font-weight:500;">I confirm my identity as <strong>Sarah Johnson</strong> (sarah@techcorp.com)</span>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="acceptSigningConsent()">I Agree & Continue to Sign →</button>
      </div>
    </div>
  `);
}

function acceptSigningConsent() {
  const consent = document.getElementById('consent-check');
  const identity = document.getElementById('identity-check');
  if (!consent?.checked || !identity?.checked) {
    showToast('Please accept consent and confirm your identity', 'error');
    return;
  }
  closeModal();
  signingWorkflowState.consentAccepted = true;
  addSigningEvent('Electronic signature consent accepted');
  updateSigningWorkflowUI();
  showToast('Consent accepted', 'success');
  openSignatureModal();
}

function submitSigningForApproval() {
  signingWorkflowState.submitted = true;
  addSigningEvent('Submitted for manager approval');
  updateSigningWorkflowUI();
  showToast('Submitted to manager approval', 'success');

  setTimeout(() => {
    signingWorkflowState.managerApproved = true;
    addSigningEvent('Manager approval completed', 'Michael Chen');
    updateSigningWorkflowUI();
    showToast('Manager approval completed', 'success');
  }, 900);

  setTimeout(() => {
    signingWorkflowState.legalApproved = true;
    addSigningEvent('Legal review approved', 'Legal Team');
    updateSigningWorkflowUI();
    showToast('Legal review approved', 'success');
  }, 1800);

  setTimeout(() => {
    signingWorkflowState.evidenceGenerated = true;
    addSigningEvent('Evidence bundle generated', 'HanMak System');
    updateSigningWorkflowUI();
    showToast('Evidence bundle generated', 'success');
  }, 2700);
}

function showStateDropdown(el) {
  const states = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','Ohio','Oklahoma','Oregon','Pennsylvania','Tennessee','Texas','Utah','Vermont','Virginia','Washington','Wisconsin'];

  openModal(`
    <div class="modal modal-sm">
      <div class="modal-header">
        <div class="modal-title">Select State / Jurisdiction</div>
        <button class="modal-close" onclick="closeModal()">${icon('x',16)}</button>
      </div>
      <div class="modal-body" style="padding:12px;">
        <input class="form-input" type="search" placeholder="Search states…" style="margin-bottom:10px;" oninput="filterStateList(this.value)">
        <div style="max-height:280px;overflow-y:auto;" id="state-list">
          ${states.map(s => `
            <div onclick="selectState('${s}')" style="padding:8px 12px;border-radius:var(--radius-sm);cursor:pointer;font-size:13px;transition:background 0.1s;" onmouseover="this.style.background='var(--bg-surface)'" onmouseout="this.style.background='transparent'">${s}</div>
          `).join('')}
        </div>
      </div>
    </div>
  `);
}

function filterStateList(q) {
  const list = document.getElementById('state-list');
  if (!list) return;
  list.querySelectorAll('div').forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(q.toLowerCase()) ? 'block' : 'none';
  });
}

function selectState(state) {
  closeModal();
  const el = document.getElementById('state-field');
  if (el) {
    el.textContent = state;
    el.style.border = '1.5px solid var(--success)';
    el.style.background = 'var(--success-light)';
    el.style.color = '#065f46';
  }
  signingWorkflowState.stateSelected = true;
  addSigningEvent(`Field filled: State / Jurisdiction (${state})`);
  updateSigningWorkflowUI();
  showToast(`State set to ${state}`, 'success');
}
