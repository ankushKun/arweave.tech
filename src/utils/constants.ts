
type Tag = {
    name: string
    value: string
}

const CommonTags: Tag[] = [
    { name: "App-Name", value: "arweave.tech" },
    { name: "App-Version", value: "0.0.1" },
]

export const Defaults = {
    HB_URL: "https://hb.arweave.tech",
    // HB_URL: "https://scheduler.forward.computer",
    GATEWAY_URL: "https://arweave.net"
}

export const Constants = {
    subspaceProcess: "nTyq896RNyX_W0F-CxZH7x1w00FdrBmD9_Qml8EmcfU",

    hyperAosModule: "wal-fUK-YnB9Kp5mN8dgMsSqPSqiGx-0SvwFUSwpDBI",
    authority: "fcoN_xJeisVsPXA-trzVAuIiqO3ydLQxM-L4XbrQKzY",

    CommonTags
}