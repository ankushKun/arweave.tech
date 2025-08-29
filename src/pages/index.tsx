import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";

const ASCII_LOGO = `
 ▄▄▄       ██▀███   █     █░▓█████ ▄▄▄    ██▒   █▓▓█████ 
▒████▄    ▓██ ▒ ██▒▓█░ █ ░█░▓█   ▀▒████▄ ▓██░   █▒▓█   ▀ 
▒██  ▀█▄  ▓██ ░▄█ ▒▒█░ █ ░█ ▒███  ▒██  ▀█▄▓██  █▒░▒███   
░██▄▄▄▄██ ▒██▀▀█▄  ░█░ █ ░█ ▒▓█  ▄░██▄▄▄▄██▒██ █░░▒▓█  ▄ 
 ▓█   ▓██▒░██▓ ▒██▒░░██▒██▓ ░▒████▒▓█   ▓██▒▒▀█░  ░▒████▒
 ▒▒   ▓▒█░░ ▒▓ ░▒▓░░ ▓░▒ ▒  ░░ ▒░ ░▒▒   ▓▒█░░ ▐░  ░░ ▒░ ░
  ▒   ▒▒ ░  ░▒ ░ ▒░  ▒ ░ ░   ░ ░  ░ ▒   ▒▒ ░░ ░░   ░ ░  ░
  ░   ▒     ░░   ░   ░   ░     ░    ░   ▒     ░░     ░   
      ░  ░   ░         ░       ░  ░     ░  ░   ░     ░  ░
                                              ░          
`;

const TOTAL_DISK_TB = 3.1
const TOTAL_RAM_MB = 24026

interface Details {
  cpu: string;
  os: string;
  ram: string;
  disk: string;
  release: string;
  height: string;
  uptime: string;
  arnsResolutionTime: string;
  cpuUsage: string;
}

// height, peers (JSON)
const INFO = "https://arweave.tech/info"
// release (JSON)
const RELEASE = "https://arweave.tech/ar-io/info"
// uptime (JSON)
const UPTIME = "https://arweave.tech/ar-io/healthcheck"
// ArNS resolution time (RAW TEXT)
const DETAILS = "https://arweave.tech/ar-io/__gateway_metrics"
// system metrics (JSON)
const SYSTEM = "https://api.arweave.tech/system"
// Minecraft Status (JSON)
const MC = "https://mcapi.us/server/status?ip=arweave.tech&port=25565"

function formatUptime(uptime: number) {
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

export default function Home() {
  const [details, setDetails] = useState<Details>({
    release: "?",
    height: "?",
    uptime: "?",
    ram: "?",
    disk: "?",
    cpu: "?",
    os: "?",
    arnsResolutionTime: "?",
    cpuUsage: "?",
  });
  const [mcStatus, setMcStatus] = useState({
    online: false,
    players: 0,
    maxPlayers: 50,
  });

  const [typedCommand, setTypedCommand] = useState("");
  const [showContent, setShowContent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Typing animation effect
  useEffect(() => {
    const command = "neofetch";
    let currentIndex = 0;

    const typeTimer = setInterval(() => {
      if (currentIndex <= command.length) {
        setTypedCommand(command.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(typeTimer);
        setIsLoading(true);
        // Start loading the content after typing
        setTimeout(() => {
          setShowContent(true);
          setIsLoading(false);
        }, 1000);
      }
    }, 100);

    return () => clearInterval(typeTimer);
  }, []);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        console.log("Fetching details...");
        setIsLoading(true);

        const detailsResponse = await fetch(DETAILS);
        const detailsText = await detailsResponse.text();
        console.log(detailsText);

        // Parse ArNS resolution time from metrics
        const arnsMatch = detailsText.match(/arns_resolution_time_ms{quantile="0.99"} (\d+\.?\d*)/)
        console.log(arnsMatch);
        const arnsResolutionTime = arnsMatch ? (parseFloat(arnsMatch[1]) / 1000).toFixed(2) : -1;

        const releaseResponse = await fetch(RELEASE);
        const releaseData = await releaseResponse.json();
        console.log(releaseData);

        const infoResponse = await fetch(INFO);
        const infoData = await infoResponse.json();
        console.log(infoData);

        const uptimeResponse = await fetch(UPTIME);
        const uptimeData = await uptimeResponse.json();
        console.log(uptimeData);

        const systemResponse = await fetch(SYSTEM);
        const systemData = await systemResponse.json();
        console.log(systemData);

        const mcResponse = await fetch(MC);
        const mcData = await mcResponse.json();
        console.log(mcData);

        setMcStatus({
          online: mcData.online,
          players: mcData.players.now,
          maxPlayers: mcData.players.max,
        });

        const data: Details = {
          release: releaseData.release,
          height: infoData.height.toString(),
          uptime: formatUptime(uptimeData.uptime),
          ram: `${systemData.ram}`,
          disk: `${systemData.disk}`,
          cpu: `${systemData.cpu}`,
          os: `${systemData.os}`,
          arnsResolutionTime: `${arnsResolutionTime}`,
          cpuUsage: `?`,
        }
        setDetails(data);
        setIsLoading(false);
      } catch (error) {
        console.error("Error fetching node details:", error);
        setIsLoading(false);
      }
    };

    if (showContent) {
      fetchDetails();
      const interval = setInterval(fetchDetails, 5000);
      return () => clearInterval(interval);
    }
  }, [showContent]);

  return (
    <div className="min-h-screen text-cyan-400 font-mono" style={{ backgroundImage: `url('/matrix.gif')` }}>
      <div className="mx-auto w-full pt-8 md:pt-16 min-h-screen bg-zinc-950/70 backdrop-blur-sm px-4 md:px-8 lg:px-12">
        <div className="max-w-7xl mx-auto rounded-lg border border-cyan-800/30 bg-black/50 shadow-2xl overflow-hidden">
          <style jsx global>{`
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-fadeIn {
              animation: fadeIn 0.5s ease-out forwards;
            }
          `}</style>
          <div className="relative bg-gray-900 px-4 py-2 border-b border-cyan-800/30 flex items-center gap-2">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
            <div className="text-center flex-1 text-sm text-gray-400">arweave.tech - Terminal</div>
            {isLoading && (
              <div className="absolute right-2 flex items-center gap-2 text-sm text-cyan-300">
                <div className="animate-spin">[-]</div>
              </div>
            )}
          </div>

          <div className="p-4 md:p-6 space-y-6">
            <div>
              <p className="text-cyan-300 font-bold text-sm mb-2">
                $ {typedCommand}
                {!showContent && <span className="animate-pulse">▋</span>}
              </p>

            </div>

            {showContent && (
              <>
                {/* System Info Section */}
                <div className="flex flex-col lg:flex-row gap-8 mb-8 animate-fadeIn">
                  <pre className="text-cyan-500 whitespace-pre text-[0.65rem] md:text-xs lg:text-sm leading-[1.15] animate-pulse">
                    {ASCII_LOGO}
                  </pre>
                  <div className="flex-1">
                    <pre className="text-xs lg:text-sm space-y-2">
                      <p className="text-cyan-300 border-b pb-4 mb-4 border-cyan-800/30 flex items-center gap-2">
                        <span className="animate-pulse">⚡</span>
                        gateway@<Link href="https://arweave.tech" className="text-cyan-300 hover:text-cyan-400 transition-colors -ml-2">arweave.tech</Link>
                        <span className="text-gray-500">[Release {details.release}]</span>
                        <span className="text-gray-500">[Block {details.height}]</span>
                      </p>

                      <p><span className="text-gray-500">OS</span>            : {details.os}</p>
                      <p><span className="text-gray-500">CPU</span>           : {details.cpu}</p>
                      <p><span className="text-gray-500">Uptime</span>        : {details.uptime}</p>
                      <p><span className="text-gray-500">Memory</span>        : {details.ram}</p>
                      <p><span className="text-gray-500">Storage</span>       : {details.disk}</p>
                      <p><span className="text-gray-500">ArNS res time</span> : {details.arnsResolutionTime}s</p>
                    </pre>
                  </div>
                </div>

                {/* Command History */}
                <div className="space-y-8 text-sm animate-fadeIn">
                  <div className="terminal-command">
                    <p className="text-cyan-300 mb-3 flex items-center gap-2">
                      <span className="text-gray-500">$</span> cat /etc/maintainer
                    </p>
                    <div className="ml-6 text-gray-400 flex flex-col md:flex-row gap-4 md:gap-10">
                      <p>Arweave Gateway Managed by <Link href="https://betteridea.dev" target="_blank" className="text-cyan-300 hover:text-cyan-400 transition-colors">BetterIDEa</Link>.</p>
                      <Link href="https://gateways.arweave.tech/#/gateways/7oTsZkXoFGh3k99rrYYOzeQzQ1Qap98BnuSvlDYIH6Y" target="_blank" className="text-cyan-300 hover:text-cyan-400 transition-colors mx-auto">Stake on our gateway to earn rewards</Link>
                    </div>
                  </div>

                  <div className="terminal-command">
                    <p className="text-cyan-300 mb-3 flex items-center gap-2">
                      <span className="text-gray-500">$</span> ls /tools
                    </p>
                    <div className="ml-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        {
                          name: "BetterIDEa",
                          desc: "IDE for AO",
                          link: "https://ide.betteridea.dev"
                        },
                        {
                          name: "APM",
                          desc: "AO Package Manager",
                          link: "https://apm.betteridea.dev"
                        },
                        {
                          name: "Visual AO",
                          desc: "No Code Programming for AO processes",
                          link: "https://visual-ao.arweave.tech"
                        },
                        {
                          name: "APM CLI Tool",
                          desc: "CLI Tool to publish APM packages",
                          link: "https://www.npmjs.com/package/apm-tool"
                        },
                        {
                          name: "LUA Code Cells",
                          desc: "Portable Lua Code Cells",
                          link: "https://www.npmjs.com/package/@betteridea/codecell"
                        },
                        {
                          name: "ArLink",
                          desc: "1 click deployments on Arweave",
                          link: "https://arlink.arweave.tech"
                        },
                        {
                          name: "Network Portal",
                          desc: "Explore & stake on Gateways",
                          link: "https://gateways.arweave.tech"
                        },
                        {
                          name: "ArNS App",
                          desc: "Explore & buy ArNS names",
                          link: "https://arns.arweave.tech"
                        }
                      ].map((tool, i) => (
                        <div key={i} className="flex items-center gap-3 group">
                          <Link
                            target="_blank"
                            href={tool.link}
                            className="text-cyan-300 hover:text-cyan-400 transition-colors flex items-center gap-2"
                          >
                            <span className="text-gray-500">→</span>
                            {tool.name}
                          </Link>
                          <span className="text-gray-500 text-xs">- {tool.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="terminal-command">
                    <p className="text-cyan-300 mb-3 flex items-center gap-2">
                      <span className="text-gray-500">$</span> ls /minecraft
                      {mcStatus.online ? (
                        // online indicator
                        <div className="ml-2 flex flex-row gap-4 text-gray-400 items-center">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <p>online</p>
                        </div>
                      ) : (
                        // offline indicator
                        <div className="ml-2 flex flex-row gap-4 text-gray-400 items-center">
                          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                          <p>offline</p>
                        </div>
                      )}
                    </p>
                    <div className="ml-6 flex flex-row gap-4 text-gray-400 items-center">
                      <Link href="https://arweave.tech/play" target="_blank">
                        <Image src="/mc.png" alt="Minecraft" width={30} height={30} />
                      </Link>
                      <p>To play minecraft connect to <span className="text-cyan-300">arweave.tech</span> in your minecraft 1.21.4 client</p>
                      <p className="text-gray-500 text-xs">
                        [{mcStatus.players}/{mcStatus.maxPlayers}] players online
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Active Terminal Line */}
            {showContent && (
              <div className="flex items-center gap-2 pt-4">
                <span className="text-gray-500">$</span>
                <div className="h-4 w-2 bg-cyan-400 animate-pulse"></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
