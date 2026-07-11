const BOS_TOKEN_ID = 49406;
const EOS_TOKEN_ID = 49407;
const MAX_LENGTH = 77;
const PAIR_SEPARATOR = "\u0001";

function bytesToUnicode() {
    const bytes = [];
    for (let value = 33; value <= 126; value += 1) bytes.push(value);
    for (let value = 161; value <= 172; value += 1) bytes.push(value);
    for (let value = 174; value <= 255; value += 1) bytes.push(value);

    const characters = bytes.slice();
    let extra = 0;
    for (let value = 0; value < 256; value += 1) {
        if (!bytes.includes(value)) {
            bytes.push(value);
            characters.push(256 + extra);
            extra += 1;
        }
    }
    return new Map(bytes.map((value, index) => [value, String.fromCodePoint(characters[index])]));
}

function pairKey(first, second) {
    return `${first}${PAIR_SEPARATOR}${second}`;
}

export class ClipTokenizer {
    constructor(vocabulary, mergesText) {
        this.encoder = vocabulary;
        this.byteEncoder = bytesToUnicode();
        this.bpeCache = new Map();
        this.tokenPattern = /<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]|[^\s\p{L}\p{N}]+/giu;
        this.merges = new Map();
        mergesText.trim().split(/\r?\n/).slice(1, 48895).forEach((line, index) => {
            const [first, second] = line.trim().split(/\s+/);
            if (first && second) this.merges.set(pairKey(first, second), index);
        });
    }

    bpe(token) {
        const cached = this.bpeCache.get(token);
        if (cached) return cached;

        const characters = Array.from(token);
        let word = [...characters.slice(0, -1), `${characters.at(-1)}</w>`];
        while (word.length > 1) {
            let bestIndex = -1;
            let bestRank = Number.POSITIVE_INFINITY;
            for (let index = 0; index < word.length - 1; index += 1) {
                const rank = this.merges.get(pairKey(word[index], word[index + 1]));
                if (rank !== undefined && rank < bestRank) {
                    bestRank = rank;
                    bestIndex = index;
                }
            }
            if (bestIndex < 0) break;
            const first = word[bestIndex];
            const second = word[bestIndex + 1];
            const merged = [];
            for (let index = 0; index < word.length; index += 1) {
                if (word[index] === first && word[index + 1] === second) {
                    merged.push(`${first}${second}`);
                    index += 1;
                } else {
                    merged.push(word[index]);
                }
            }
            word = merged;
        }

        const encoded = word.join(" ");
        this.bpeCache.set(token, encoded);
        return encoded;
    }

    encode(text) {
        const cleanText = String(text ?? "").trim().toLowerCase();
        if (!cleanText) throw new Error("Prompt 不能为空。");

        const tokenIds = [];
        for (const token of cleanText.matchAll(this.tokenPattern)) {
            const byteEncoded = Array.from(new TextEncoder().encode(token[0]), (value) => this.byteEncoder.get(value)).join("");
            for (const piece of this.bpe(byteEncoded).split(" ")) {
                const tokenId = this.encoder[piece];
                if (!Number.isInteger(tokenId)) throw new Error(`CLIP tokenizer 未识别 token：${piece}`);
                tokenIds.push(tokenId);
            }
        }

        const ids = new BigInt64Array(MAX_LENGTH);
        ids.fill(BigInt(EOS_TOKEN_ID));
        ids[0] = BigInt(BOS_TOKEN_ID);
        tokenIds.slice(0, MAX_LENGTH - 2).forEach((tokenId, index) => {
            ids[index + 1] = BigInt(tokenId);
        });
        ids[Math.min(tokenIds.length + 1, MAX_LENGTH - 1)] = BigInt(EOS_TOKEN_ID);
        return ids;
    }
}
