/* F1: validacao de solicitacao, sem dependencia de navegador ou pagamentos. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SMRequestF1 = api;
})(typeof window === "undefined" ? null : window, function () {
  "use strict";
  const SERVICE_TYPES = Object.freeze({
    pneu_furado: "Pneu furado / reparo",
    troca_camara: "Troca de câmara",
    troca_pneu: "Troca de pneu",
    calibragem_valvula: "Calibragem ou válvula",
    reboque_moto: "Reboque de moto",
    outro: "Outro problema"
  });
  const MAX_ORIGINAL_BYTES = 8 * 1024 * 1024;
  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  const MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const clean = value => String(value ?? "").trim().replace(/\s+/g, " ");
  function validatePhoto(file) {
    if (!file || typeof file.size !== "number") throw new Error("Envie uma foto do problema.");
    if (!MIME_TYPES.includes(file.type)) throw new Error("Use uma foto JPG, PNG ou WebP.");
    if (file.size < 1 || file.size > MAX_ORIGINAL_BYTES) throw new Error("A foto original deve ter até 8 MB.");
    return true;
  }
  function validateRequest(data, yearNow) {
    const brand = clean(data.brand), model = clean(data.model);
    const yearString = String(data.year ?? "").trim();
    const currentYear = Number.isInteger(yearNow) ? yearNow : new Date().getFullYear();
    if (brand.length < 2 || brand.length > 70 || model.length < 2 || model.length > 90)
      throw new Error("Informe marca (2 a 70 caracteres) e modelo (2 a 90 caracteres) válidos.");
    if (!/^\d{4}$/.test(yearString) || Number(yearString) < 1950 || Number(yearString) > currentYear + 1) {
      throw new Error("Informe um ano válido da motocicleta.");
    }
    const selected = [...new Set(Array.isArray(data.services) ? data.services : [])];
    if (!selected.length || selected.some(code => !Object.prototype.hasOwnProperty.call(SERVICE_TYPES, code))) {
      throw new Error("Selecione pelo menos um serviço válido.");
    }
    // O despacho atual do banco é apenas de borracharia delivery.
    if (selected.includes("reboque_moto")) {
      throw new Error("Reboque será liberado após a etapa de integração de prestadores e despacho. Nenhum pedido de reboque será enviado neste MVP.");
    }
    const problem = String(data.problem ?? "").trim();
    const address = String(data.address ?? "").trim();
    if (problem.length < 5 || problem.length > 1900) throw new Error("Descreva o problema (5 a 1.900 caracteres).");
    if (address.length < 6 || address.length > 280) throw new Error("Informe endereço válido do atendimento.");
    validatePhoto(data.photo);
    return { brand, model, year: Number(yearString), services: selected, problem, address };
  }
  function makePhotoPath(userId, uploadId) {
    if (!/^[a-f0-9-]{36}$/i.test(userId) || !/^[a-f0-9-]{36}$/i.test(uploadId)) {
      throw new Error("Identificador seguro inválido para a foto.");
    }
    return userId + "/" + uploadId + ".jpg";
  }
  // Redesenha os pixels da imagem, removendo EXIF/GPS antes do upload.
  // Injeção opcional de dependências permite testar o processamento real sem API de rede.
  async function preparePrivatePhoto(file, env = {}) {
    validatePhoto(file);
    const decode = env.createImageBitmap ?? (typeof createImageBitmap === "function" ? createImageBitmap : null);
    const dom = env.document ?? (typeof document !== "undefined" ? document : null);
    const objectUrls = env.URL ?? (typeof URL !== "undefined" ? URL : null);
    const ImageCtor = env.Image ?? (typeof Image !== "undefined" ? Image : null);
    let image, objectUrl;
    try {
      if (decode) image = await decode(file);
      else {
        if (!objectUrls || !ImageCtor) throw new Error("Foto ilegível.");
        objectUrl = objectUrls.createObjectURL(file);
        image = new ImageCtor();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error("Foto ilegível."));
          image.src = objectUrl;
        });
      }
      const width = image.width, height = image.height;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
        throw new Error("Foto sem dimensões válidas.");
      }
      const scale = Math.min(1, 1600 / Math.max(width, height));
      if (!dom) throw new Error("Não foi possível preparar a foto.");
      const canvas = dom.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível preparar a foto.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const jpeg = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (!jpeg || jpeg.type !== "image/jpeg" || jpeg.size < 1 || jpeg.size > MAX_UPLOAD_BYTES)
        throw new Error("Não foi possível gerar foto JPG de até 5 MB.");
      return jpeg;
    } catch (error) {
      if (error instanceof Error && /Foto|foto|imagem|JPG|MB/.test(error.message)) throw error;
      throw new Error("Não foi possível ler a foto. Escolha outra imagem JPG, PNG ou WebP.");
    } finally {
      if (image && typeof image.close === "function") image.close();
      if (objectUrl) objectUrls.revokeObjectURL(objectUrl);
    }
  }
  return Object.freeze({ SERVICE_TYPES, MAX_ORIGINAL_BYTES, MAX_UPLOAD_BYTES, validatePhoto, validateRequest, makePhotoPath, preparePrivatePhoto });
});
