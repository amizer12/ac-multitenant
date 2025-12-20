import React, { useState, useEffect } from 'react';
import './App.css';
import axios from 'axios';

// Configuration loaded from window.APP_CONFIG (injected at deployment time)
const API_ENDPOINT = window.APP_CONFIG?.API_ENDPOINT || 'http://localhost:3000';
const API_KEY = window.APP_CONFIG?.API_KEY || '';

function App() {
  const [tenantId, setTenantId] = useState('');
  const [deploymentStatus, setDeploymentStatus] = useState('');
  const [deployedAgent, setDeployedAgent] = useState(null);
  const [tokenUsage, setTokenUsage] = useState([]);
  const [agents, setAgents] = useState([]);
  const [deployLoading, setDeployLoading] = useState(false);
  const [invokeLoading, setInvokeLoading] = useState(false);
  const [invokeMessage, setInvokeMessage] = useState('');
  const [invokeResponse, setInvokeResponse] = useState('');
  const [selectedAgentForInvoke, setSelectedAgentForInvoke] = useState(null);
  
  // Configuration state
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [agentConfig, setAgentConfig] = useState({
    modelId: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    systemPrompt: 'You are a helpful AI assistant.',
    customSettings: {}
  });
  
  // Template configuration state
  const [useCustomTemplate, setUseCustomTemplate] = useState(false);
  const [templateConfig, setTemplateConfig] = useState({
    source: 'github',
    repo: '',
    path: 'templates/main.py',
    branch: 'main',
    token: ''
  });
  
  // Tools configuration state
  const [availableTools, setAvailableTools] = useState([]);
  const [selectedTools, setSelectedTools] = useState([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [toolsRepo, setToolsRepo] = useState('');
  
  // Sorting state for agents table
  const [agentsSortConfig, setAgentsSortConfig] = useState({ key: null, direction: 'asc' });
  
  // Sorting state for token usage table
  const [usageSortConfig, setUsageSortConfig] = useState({ key: null, direction: 'asc' });
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Fetch token usage aggregations from API
  const fetchTokenUsage = async () => {
    try {
      const response = await axios.get(`${API_ENDPOINT}/usage`, {
        headers: {
          'x-api-key': API_KEY
        }
      });
      const data = Array.isArray(response.data) ? response.data : JSON.parse(response.data);
      setTokenUsage(data || []);
    } catch (error) {
      console.error('Error fetching token usage:', error);
    }
  };

  // Fetch all agents from API
  const fetchAgents = async () => {
    try {
      const response = await axios.get(`${API_ENDPOINT}/agents`, {
        headers: {
          'x-api-key': API_KEY
        }
      });
      const data = Array.isArray(response.data) ? response.data : JSON.parse(response.data);
      setAgents(data || []);
      
      // Auto-select first agent if none is selected and agents exist
      if (data && data.length > 0 && !selectedAgentForInvoke) {
        setSelectedAgentForInvoke(data[0]);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };
  
  // Helper function to extract repo path from GitHub URL
  const extractRepoPath = (repoInput) => {
    if (!repoInput) return '';
    
    // If it's already in the format "owner/repo", return as is
    if (repoInput.match(/^[^\/]+\/[^\/]+$/)) {
      return repoInput;
    }
    
    // If it's a full GitHub URL, extract owner/repo
    const match = repoInput.match(/github\.com\/([^\/]+\/[^\/]+)/);
    if (match) {
      return match[1].replace(/\.git$/, ''); // Remove .git if present
    }
    
    return repoInput;
  };

  // Fetch tool catalog from GitHub
  const fetchToolCatalog = async () => {
    if (!toolsRepo) {
      setAvailableTools([]);
      return;
    }
    
    setLoadingTools(true);
    try {
      const repoPath = extractRepoPath(toolsRepo);
      const branch = templateConfig.branch || 'main';
      const url = `https://api.github.com/repos/${repoPath}/contents/catalog.json?ref=${branch}`;
      const headers = {
        'Accept': 'application/vnd.github.v3+json'
      };
      
      if (templateConfig.token) {
        headers['Authorization'] = `token ${templateConfig.token}`;
      }
      
      console.log(`Fetching catalog from: ${url}`);
      const response = await axios.get(url, { headers });
      const content = atob(response.data.content);
      const catalog = JSON.parse(content);
      
      setAvailableTools(catalog.tools || []);
      console.log(`Loaded ${catalog.tools?.length || 0} tools from catalog`);
    } catch (error) {
      console.error('Error fetching tool catalog:', error);
      setAvailableTools([]);
      alert('Failed to fetch tool catalog. Please check the repository and try again.');
    } finally {
      setLoadingTools(false);
    }
  };
  
  // Toggle tool selection
  const toggleToolSelection = (tool) => {
    const isSelected = selectedTools.some(t => t.id === tool.id);
    if (isSelected) {
      setSelectedTools(selectedTools.filter(t => t.id !== tool.id));
    } else {
      setSelectedTools([...selectedTools, { ...tool, config: {} }]);
    }
  };

  // Delete an agent
  const deleteAgent = async (tenantId, agentRuntimeId, agentName) => {
    if (!window.confirm(`Are you sure you want to delete agent "${agentName}" for tenant: ${tenantId}?`)) {
      return;
    }

    try {
      await axios.delete(`${API_ENDPOINT}/agent?tenantId=${tenantId}&agentRuntimeId=${agentRuntimeId}`);
      alert(`Agent "${agentName}" deleted successfully`);
      fetchAgents(); // Refresh the list
      
      // Clear selected agent if it was the one deleted
      if (selectedAgentForInvoke && selectedAgentForInvoke.agentRuntimeId === agentRuntimeId) {
        setSelectedAgentForInvoke(null);
      }
      
      // Clear deployed agent if it was the one deleted
      if (deployedAgent && deployedAgent.agentRuntimeId === agentRuntimeId) {
        setDeployedAgent(null);
        setDeploymentStatus('');
      }
    } catch (error) {
      console.error('Error deleting agent:', error);
      alert(`Error deleting agent: ${error.response?.data?.error || error.message}`);
    }
  };

  // Sorting function
  const sortData = (data, sortConfig) => {
    if (!sortConfig.key) return data;
    
    const sortedData = [...data].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      // Handle null/undefined values
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      // Handle dates
      if (sortConfig.key === 'deployedAt') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      // Handle numbers
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      // Handle strings
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      
      if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    return sortedData;
  };
  
  // Handle sort for agents table
  const handleAgentsSort = (key) => {
    let direction = 'asc';
    if (agentsSortConfig.key === key && agentsSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setAgentsSortConfig({ key, direction });
  };
  
  // Handle sort for usage table
  const handleUsageSort = (key) => {
    let direction = 'asc';
    if (usageSortConfig.key === key && usageSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setUsageSortConfig({ key, direction });
  };
  
  // Get sort indicator
  const getSortIndicator = (columnKey, sortConfig) => {
    if (sortConfig.key !== columnKey) return ' ↕️';
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  useEffect(() => {
    fetchTokenUsage();
    fetchAgents();
    const interval = setInterval(() => {
      fetchTokenUsage();
      fetchAgents();
    }, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const deployAgent = async () => {
    if (!tenantId) {
      alert('Please enter a Tenant ID');
      return;
    }

    setDeployLoading(true);
    setDeploymentStatus('Starting agent deployment...');

    try {
      const payload = {
        config: agentConfig
      };
      
      // Add template configuration if custom template is enabled
      if (useCustomTemplate && templateConfig.repo) {
        payload.template = {
          source: 'github',
          repo: extractRepoPath(templateConfig.repo),
          path: templateConfig.path || 'templates/main.py',
          branch: templateConfig.branch || 'main',
          token: templateConfig.token || undefined
        };
      }
      
      // Add tools configuration if tools are selected
      if (selectedTools.length > 0 && toolsRepo) {
        payload.tools = {
          repo: extractRepoPath(toolsRepo),
          branch: templateConfig.branch || 'main',
          selected: selectedTools.map(tool => ({
            id: tool.id,
            config: tool.config || {}
          }))
        };
      }
      
      const response = await axios.post(
        `${API_ENDPOINT}/deploy?tenantId=${tenantId}`,
        payload,
        {
          headers: {
            'x-api-key': API_KEY,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      
      // Check if deployment started (202 status)
      if (response.status === 202 || data.status === 'deploying') {
        setDeploymentStatus(`✓ Deployment started for tenant: ${tenantId}. Checking for completion...`);
        
        // Store tenant info for later
        setDeployedAgent({
          tenantId: tenantId,
          status: 'deploying',
          note: 'Agent is being deployed in the background'
        });
        
        // Start polling for agent details
        let pollCount = 0;
        const maxPolls = 36; // 3 minutes (36 * 5 seconds)
        
        const pollInterval = setInterval(async () => {
          pollCount++;
          
          try {
            // Check if agent is ready
            const agentResponse = await axios.get(`${API_ENDPOINT}/agent?tenantId=${tenantId}`);
            
            if (agentResponse.status === 200 && agentResponse.data) {
              // Agent found!
              clearInterval(pollInterval);
              setDeployedAgent(agentResponse.data);
              setDeploymentStatus(`✓ Agent deployed successfully for tenant: ${tenantId}!`);
              fetchTokenUsage();
            }
          } catch (error) {
            // Agent not found yet, keep polling
            if (error.response?.status === 404) {
              console.log(`Agent not ready yet (poll ${pollCount}/${maxPolls})`);
            } else {
              console.error('Error polling for agent:', error);
            }
          }
          
          // Also refresh token usage
          fetchTokenUsage();
          
          // Stop polling after max attempts
          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            setDeploymentStatus(`Deployment may still be in progress. Check the token usage table or refresh the page.`);
          }
        }, 5000); // Poll every 5 seconds
      } else {
        // Immediate success (shouldn't happen with async)
        setDeployedAgent(data);
        setDeploymentStatus('Agent deployed successfully!');
      }
      
      fetchTokenUsage();
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        setDeploymentStatus('Request timeout. Deployment may still be processing in the background.');
      } else {
        const errorMsg = error.response?.data?.error || error.message;
        setDeploymentStatus(`Error: ${errorMsg}`);
      }
    } finally {
      setDeployLoading(false);
    }
  };
  
  const closeModal = () => {
    setIsModalOpen(false);
  };
  
  const openModal = () => {
    setIsModalOpen(true);
  };

  const invokeAgent = async () => {
    if (!selectedAgentForInvoke || !invokeMessage) {
      alert('Please select an agent and enter a message');
      return;
    }

    setInvokeLoading(true);
    setInvokeResponse('Invoking agent...');

    try {
      const response = await axios.post(
        `${API_ENDPOINT}/invoke`,
        {
          agentId: selectedAgentForInvoke.agentRuntimeArn,
          inputText: invokeMessage,
          sessionId: `session-${Date.now()}`
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );
      
      const data = response.data;
      let responseText = data.completion || JSON.stringify(data);
      
      // Parse the response to extract clean text
      const extractText = (obj) => {
        // If it's already a string, check if it needs parsing
        if (typeof obj === 'string') {
          // Try to parse if it looks like JSON
          if (obj.trim().startsWith('{') || obj.trim().startsWith('[')) {
            try {
              obj = JSON.parse(obj);
            } catch (e) {
              // Not valid JSON, return as-is
              return obj;
            }
          } else {
            return obj;
          }
        }
        
        // Now handle object structures
        if (typeof obj === 'object' && obj !== null) {
          // Check for result key
          if (obj.result) {
            return extractText(obj.result);
          }
          
          // Check for content array
          if (Array.isArray(obj.content)) {
            return obj.content
              .map(item => {
                if (typeof item === 'string') return item;
                if (item.text) return item.text;
                return '';
              })
              .filter(text => text.length > 0)
              .join('\n\n');
          }
          
          // Check for direct text property
          if (obj.text) {
            return obj.text;
          }
          
          // Check for message property
          if (obj.message) {
            return extractText(obj.message);
          }
          
          // If we have role and content, extract content
          if (obj.role && obj.content) {
            return extractText(obj.content);
          }
        }
        
        // Fallback to string representation
        return typeof obj === 'string' ? obj : JSON.stringify(obj);
      };
      
      responseText = extractText(responseText);
      
      // Clean up any remaining escape sequences
      responseText = responseText.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      
      setInvokeResponse(responseText);
      
      // Refresh token usage after a short delay
      setTimeout(() => fetchTokenUsage(), 2000);
    } catch (error) {
      console.error('Agent invocation error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
      setInvokeResponse(`Error: ${errorMessage}`);
    } finally {
      setInvokeLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>✨ Bedrock Agent Dashboard</h1>
        <p>Deploy and manage your AI agents</p>
      </header>

      <div className="container">
        {/* Deploy Agent Button */}
        <div className="deploy-button-container">
          <button onClick={openModal} className="btn-open-modal">
            ➕ Deploy New Agent
          </button>
        </div>

        {/* Invoke Agent Section */}
        <div className="card">
          <h2>Invoke Agent</h2>
          
          {/* Agent Selection Dropdown */}
          <div className="form-group">
            <label>Select Agent:</label>
            <select
              value={selectedAgentForInvoke?.agentRuntimeId || ''}
              onChange={(e) => {
                const agent = agents.find(a => a.agentRuntimeId === e.target.value);
                setSelectedAgentForInvoke(agent);
              }}
              disabled={invokeLoading || agents.length === 0}
              className="agent-select"
            >
              {agents.length === 0 ? (
                <option value="">No agents available</option>
              ) : (
                agents.map((agent) => (
                  <option key={agent.agentRuntimeId} value={agent.agentRuntimeId}>
                    {agent.tenantId} - {agent.agentName || 'Unnamed'} ({agent.status || 'unknown'})
                  </option>
                ))
              )}
            </select>
          </div>
          
          {/* Display selected agent info */}
          {selectedAgentForInvoke && (
            <div className="selected-agent-info">
              <p><strong>Selected:</strong> {selectedAgentForInvoke.agentName || selectedAgentForInvoke.tenantId}</p>
              <p><strong>Tenant:</strong> {selectedAgentForInvoke.tenantId}</p>
              <p><strong>Status:</strong> <span className={`status-badge ${selectedAgentForInvoke.status || 'unknown'}`}>
                {selectedAgentForInvoke.status || 'unknown'}
              </span></p>
            </div>
          )}
          
          <div className="form-group">
            <label>Message:</label>
            <textarea
              value={invokeMessage}
              onChange={(e) => setInvokeMessage(e.target.value)}
              placeholder="Enter your message to the agent..."
              rows="4"
              disabled={invokeLoading || !selectedAgentForInvoke}
            />
          </div>
          <button onClick={invokeAgent} disabled={invokeLoading || !selectedAgentForInvoke} className="btn-secondary">
            {invokeLoading ? 'Invoking...' : 'Invoke Agent'}
          </button>
          {invokeResponse && (
            <div className="response">
              <h3>Response:</h3>
              <div className="response-text">
                {invokeResponse.split('\n').map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Active Agents Section */}
        <div className="card full-width">
          <h2>Active Agents</h2>
          <button onClick={fetchAgents} className="btn-refresh">
            🔄 Refresh
          </button>
          {agents.length === 0 ? (
            <p className="no-data">No active agents found.</p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th onClick={() => handleAgentsSort('tenantId')} className="sortable">
                      Tenant ID{getSortIndicator('tenantId', agentsSortConfig)}
                    </th>
                    <th onClick={() => handleAgentsSort('agentName')} className="sortable">
                      Agent Name{getSortIndicator('agentName', agentsSortConfig)}
                    </th>
                    <th onClick={() => handleAgentsSort('agentRuntimeId')} className="sortable">
                      Agent ID{getSortIndicator('agentRuntimeId', agentsSortConfig)}
                    </th>
                    <th onClick={() => handleAgentsSort('status')} className="sortable">
                      Status{getSortIndicator('status', agentsSortConfig)}
                    </th>
                    <th onClick={() => handleAgentsSort('deployedAt')} className="sortable">
                      Deployed At{getSortIndicator('deployedAt', agentsSortConfig)}
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortData(agents, agentsSortConfig).map((agent) => (
                    <tr key={agent.agentRuntimeId}>
                      <td><strong>{agent.tenantId}</strong></td>
                      <td>{agent.agentName || 'N/A'}</td>
                      <td><code className="agent-id">{agent.agentRuntimeId || 'N/A'}</code></td>
                      <td>
                        <span className={`status-badge ${agent.status || 'unknown'}`}>
                          {agent.status || 'unknown'}
                        </span>
                      </td>
                      <td>{agent.deployedAt ? new Date(agent.deployedAt).toLocaleString() : 'N/A'}</td>
                      <td>
                        <button 
                          onClick={() => deleteAgent(agent.tenantId, agent.agentRuntimeId, agent.agentName)} 
                          className="btn-delete"
                          title="Delete agent"
                        >
                          🗑️ Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Token Usage Section */}
        <div className="card full-width">
          <h2>Token Usage by Tenant</h2>
          <button onClick={fetchTokenUsage} className="btn-refresh">
            🔄 Refresh
          </button>
          {tokenUsage.length === 0 ? (
            <p className="no-data">No token usage data available yet.</p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th onClick={() => handleUsageSort('tenant_id')} className="sortable">
                      Tenant ID{getSortIndicator('tenant_id', usageSortConfig)}
                    </th>
                    <th onClick={() => handleUsageSort('input_tokens')} className="sortable">
                      Input Tokens{getSortIndicator('input_tokens', usageSortConfig)}
                    </th>
                    <th onClick={() => handleUsageSort('output_tokens')} className="sortable">
                      Output Tokens{getSortIndicator('output_tokens', usageSortConfig)}
                    </th>
                    <th onClick={() => handleUsageSort('total_tokens')} className="sortable">
                      Total Tokens{getSortIndicator('total_tokens', usageSortConfig)}
                    </th>
                    <th onClick={() => handleUsageSort('request_count')} className="sortable">
                      Requests{getSortIndicator('request_count', usageSortConfig)}
                    </th>
                    <th onClick={() => handleUsageSort('total_cost')} className="sortable">
                      Total Cost{getSortIndicator('total_cost', usageSortConfig)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortData(
                    tokenUsage.filter(item => item.aggregation_key.startsWith('tenant:')),
                    usageSortConfig
                  ).map((item) => {
                    // Calculate cost if not already in the data
                    // Convert to numbers explicitly since DynamoDB Decimals come as strings
                    const inputTokens = Number(item.input_tokens) || 0;
                    const outputTokens = Number(item.output_tokens) || 0;
                    const inputCost = Number(item.input_cost) || (inputTokens * 0.003 / 1000);
                    const outputCost = Number(item.output_cost) || (outputTokens * 0.015 / 1000);
                    const totalCost = Number(item.total_cost) || (inputCost + outputCost);
                    
                    return (
                      <tr key={item.aggregation_key}>
                        <td><strong>{item.tenant_id}</strong></td>
                        <td>{inputTokens.toLocaleString()}</td>
                        <td>{outputTokens.toLocaleString()}</td>
                        <td><strong>{Number(item.total_tokens || 0).toLocaleString()}</strong></td>
                        <td>{Number(item.request_count) || 0}</td>
                        <td className="cost-cell">
                          <strong>${totalCost.toFixed(6)}</strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Cost Summary */}
          {tokenUsage.length > 0 && (
            <div className="cost-summary">
              <h3>💰 Cost Summary</h3>
              <div className="cost-summary-grid">
                <div className="cost-summary-item">
                  <span className="cost-label">Total Cost (All Tenants):</span>
                  <span className="cost-value">
                    ${tokenUsage
                      .filter(item => item.aggregation_key && item.aggregation_key.startsWith('tenant:'))
                      .reduce((sum, item) => {
                        // Convert to numbers explicitly since DynamoDB Decimals come as strings
                        const inputTokens = Number(item.input_tokens) || 0;
                        const outputTokens = Number(item.output_tokens) || 0;
                        const cost = Number(item.total_cost) || ((inputTokens * 0.003 / 1000) + (outputTokens * 0.015 / 1000));
                        return sum + cost;
                      }, 0)
                      .toFixed(6)}
                  </span>
                </div>
                <div className="cost-summary-item">
                  <span className="cost-label">Pricing:</span>
                  <span className="cost-value-small">
                    Input: $0.003/1K tokens | Output: $0.015/1K tokens
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer>
        <p>Powered by AWS Bedrock Agent Core</p>
      </footer>

      {/* Deploy Agent Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Deploy New Agent</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Tenant ID:</label>
                <input
                  type="text"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  placeholder="e.g., tenant-123"
                  disabled={deployLoading}
                />
              </div>
              
              {/* Advanced Configuration Toggle */}
              <div className="form-group">
                <button 
                  onClick={() => setShowAdvancedConfig(!showAdvancedConfig)} 
                  className="btn-secondary"
                  type="button"
                >
                  {showAdvancedConfig ? '▼ Hide' : '▶ Show'} Advanced Configuration
                </button>
              </div>
              
              {/* Advanced Configuration Panel */}
              {showAdvancedConfig && (
                <div className="config-panel">
                  <div className="form-group">
                    <label>Model ID:</label>
                    <select
                      value={agentConfig.modelId}
                      onChange={(e) => setAgentConfig({...agentConfig, modelId: e.target.value})}
                      disabled={deployLoading}
                    >
                      <option value="us.anthropic.claude-opus-4-5-20251101-v1:0">Claude Opus 4.5</option>
                      <option value="us.anthropic.claude-sonnet-4-5-20250929-v1:0">Claude Sonnet 4.5</option>
                      <option value="us.anthropic.claude-haiku-4-5-20251001-v1:0">Claude Haiku 4.5</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label>System Prompt:</label>
                    <textarea
                      value={agentConfig.systemPrompt}
                      onChange={(e) => setAgentConfig({...agentConfig, systemPrompt: e.target.value})}
                      placeholder="You are a helpful AI assistant."
                      rows="3"
                      disabled={deployLoading}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={useCustomTemplate}
                        onChange={(e) => setUseCustomTemplate(e.target.checked)}
                        disabled={deployLoading}
                      />
                      {' '}Use Custom Template from GitHub
                    </label>
                  </div>
                  
                  {useCustomTemplate && (
                    <div className="template-config">
                      <div className="form-group">
                        <label>GitHub Repository (owner/repo):</label>
                        <input
                          type="text"
                          value={templateConfig.repo}
                          onChange={(e) => {
                            setTemplateConfig({...templateConfig, repo: e.target.value});
                            setToolsRepo(e.target.value);
                          }}
                          placeholder="e.g., your-org/agent-templates"
                          disabled={deployLoading}
                        />
                      </div>
                      
                      <div className="form-group">
                        <label>File Path:</label>
                        <input
                          type="text"
                          value={templateConfig.path}
                          onChange={(e) => setTemplateConfig({...templateConfig, path: e.target.value})}
                          placeholder="e.g., templates/main.py"
                          disabled={deployLoading}
                        />
                      </div>
                      
                      <div className="form-group">
                        <label>Branch:</label>
                        <input
                          type="text"
                          value={templateConfig.branch}
                          onChange={(e) => setTemplateConfig({...templateConfig, branch: e.target.value})}
                          placeholder="main"
                          disabled={deployLoading}
                        />
                      </div>
                      
                      <div className="form-group">
                        <label>GitHub Token (optional, for private repos):</label>
                        <input
                          type="password"
                          value={templateConfig.token}
                          onChange={(e) => setTemplateConfig({...templateConfig, token: e.target.value})}
                          placeholder="ghp_xxxxxxxxxxxx"
                          disabled={deployLoading}
                        />
                        <small>Leave empty for public repositories</small>
                      </div>
                      
                      {/* Tools Selection Section */}
                      <div className="tools-section">
                        <h4>🛠️ Select Tools for Agent</h4>
                        <button 
                          onClick={fetchToolCatalog} 
                          disabled={!toolsRepo || loadingTools || deployLoading}
                          className="btn-load-tools"
                          type="button"
                        >
                          {loadingTools ? 'Loading Tools...' : 'Load Available Tools'}
                        </button>
                        
                        {availableTools.length > 0 && (
                          <div className="tools-grid">
                            {availableTools.map((tool) => {
                              const isSelected = selectedTools.some(t => t.id === tool.id);
                              return (
                                <div 
                                  key={tool.id} 
                                  className={`tool-card ${isSelected ? 'selected' : ''}`}
                                  onClick={() => !deployLoading && toggleToolSelection(tool)}
                                >
                                  <div className="tool-icon">{tool.icon || '🔧'}</div>
                                  <div className="tool-info">
                                    <div className="tool-name">{tool.name}</div>
                                    <div className="tool-description">{tool.description}</div>
                                    <div className="tool-category">{tool.category}</div>
                                  </div>
                                  {isSelected && <div className="tool-checkmark">✓</div>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        
                        {selectedTools.length > 0 && (
                          <div className="selected-tools-summary">
                            <strong>Selected Tools ({selectedTools.length}):</strong>
                            <div className="selected-tools-list">
                              {selectedTools.map(tool => (
                                <span key={tool.id} className="selected-tool-badge">
                                  {tool.icon || '🔧'} {tool.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {deploymentStatus && (
                <div className={`status ${deploymentStatus.includes('Error') ? 'error' : 'success'}`}>
                  {deploymentStatus}
                </div>
              )}
              
              {deployedAgent && (
                <div className="agent-details">
                  <h3>Deployed Agent Details</h3>
                  <p><strong>Tenant ID:</strong> {deployedAgent.tenantId}</p>
                  {deployedAgent.status === 'deploying' ? (
                    <div className="deploying-info">
                      <p><strong>Status:</strong> 🔄 Deploying in background...</p>
                      <p><em>Agent details will be available once deployment completes (1-2 minutes)</em></p>
                      <p><em>The token usage table will update automatically when the agent is ready</em></p>
                    </div>
                  ) : (
                    <>
                      <p><strong>Agent Name:</strong> {deployedAgent.agentName || 'N/A'}</p>
                      <p><strong>Agent ID:</strong> {deployedAgent.agentRuntimeId || 'N/A'}</p>
                      <p><strong>Endpoint:</strong> <code>{deployedAgent.agentEndpointUrl || 'N/A'}</code></p>
                      {deployedAgent.deployedAt && (
                        <p><strong>Deployed At:</strong> {new Date(deployedAgent.deployedAt).toLocaleString()}</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button onClick={closeModal} className="btn-secondary" disabled={deployLoading}>
                Cancel
              </button>
              <button onClick={deployAgent} disabled={deployLoading} className="btn-primary">
                {deployLoading ? 'Deploying...' : 'Deploy Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
